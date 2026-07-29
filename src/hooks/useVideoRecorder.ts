import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureMicrophone } from '../camera/openCamera'
import {
  formatRecordingDuration,
  isRecordingSupported,
  makeRecordingFilename,
  pickRecorderMimeType,
} from '../recording/recordVideo'
import {
  getRollingBufferStats,
  rollingHoursToMs,
  saveRollingSegment,
  type RecordingMeta,
  type RollingBufferStats,
  type RollingHours,
} from '../recording/library'

/** Ett segment ≈ 1 min — lav RAM, rask overskriv. */
const SEGMENT_MS = 60_000
/** ~1,5 Mbps ≈ 11 MB/min → ~0,7 GB/t (mer realistisk for 5 t på mobil). */
const VIDEO_BITRATE = 1_500_000
const AUDIO_BITRATE = 128_000

export type RecordingSaveResult = 'library' | null

export function useVideoRecorder(
  getStream: () => MediaStream | null,
  onLibrarySaved?: (meta: RecordingMeta) => void,
  getRollingHours?: () => RollingHours,
) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef('video/webm')
  const loopStartedAtRef = useRef(0)
  const segmentStartedAtRef = useRef(0)
  const sessionIdRef = useRef('')
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rotateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)
  const rotatingRef = useRef(false)
  const recordStreamRef = useRef<MediaStream | null>(null)
  const onSavedRef = useRef(onLibrarySaved)
  const getHoursRef = useRef(getRollingHours)
  const rotateSegmentRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    onSavedRef.current = onLibrarySaved
  }, [onLibrarySaved])

  useEffect(() => {
    getHoursRef.current = getRollingHours
  }, [getRollingHours])

  const [recording, setRecording] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  const [bufferStats, setBufferStats] = useState<RollingBufferStats>({
    segmentCount: 0,
    durationMs: 0,
    sizeBytes: 0,
  })
  const [recordError, setRecordError] = useState<string | null>(null)
  const [lastSave, setLastSave] = useState<RecordingSaveResult>(null)
  const supported = isRecordingSupported()

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const clearRotateTimer = useCallback(() => {
    if (rotateTimerRef.current) {
      clearTimeout(rotateTimerRef.current)
      rotateTimerRef.current = null
    }
  }, [])

  const refreshBufferStats = useCallback(async () => {
    try {
      setBufferStats(await getRollingBufferStats())
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refreshBufferStats()
  }, [refreshBufferStats])

  const finalizeBlob = useCallback((): Blob | null => {
    const chunks = chunksRef.current
    chunksRef.current = []
    if (chunks.length === 0) return null
    return new Blob(chunks, { type: mimeRef.current })
  }, [])

  const persistSegment = useCallback(
    async (blob: Blob | null, durationMsSeg: number) => {
      if (!blob || blob.size < 64 || durationMsSeg < 400) return null
      const hours = getHoursRef.current?.() ?? 1
      const maxDurationMs = rollingHoursToMs(hours)
      const filename = makeRecordingFilename(blob.type || mimeRef.current)
      try {
        const meta = await saveRollingSegment({
          blob,
          name: filename,
          durationMs: durationMsSeg,
          sessionId: sessionIdRef.current,
          maxDurationMs,
        })
        setLastSave('library')
        setRecordError(null)
        await refreshBufferStats()
        onSavedRef.current?.(meta)
        return meta
      } catch (e) {
        setRecordError(
          e instanceof Error
            ? e.message
            : 'Kunne ikke lagre segment (full lagring?).',
        )
        return null
      }
    },
    [refreshBufferStats],
  )

  const stopCurrentRecorder = useCallback(async (): Promise<void> => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      recorderRef.current = null
      return
    }

    await new Promise<void>((resolve) => {
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      recorder.onstop = () => {
        const dur = Date.now() - segmentStartedAtRef.current
        const blob = finalizeBlob()
        recorderRef.current = null
        void persistSegment(blob, dur).finally(() => resolve())
      }
      try {
        if (recorder.state === 'recording') recorder.requestData()
        recorder.stop()
      } catch {
        recorderRef.current = null
        resolve()
      }
    })
  }, [finalizeBlob, persistSegment])

  const startSegmentRecorder = useCallback((): boolean => {
    const recordStream = recordStreamRef.current
    if (!recordStream || !activeRef.current) return false

    const mime = pickRecorderMimeType()
    mimeRef.current = mime ?? 'video/webm'
    chunksRef.current = []

    const opts: MediaRecorderOptions = {
      videoBitsPerSecond: VIDEO_BITRATE,
      audioBitsPerSecond: AUDIO_BITRATE,
    }
    if (mime) opts.mimeType = mime

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(recordStream, opts)
    } catch {
      try {
        recorder = mime
          ? new MediaRecorder(recordStream, {
              mimeType: mime,
              videoBitsPerSecond: VIDEO_BITRATE,
            })
          : new MediaRecorder(recordStream, {
              videoBitsPerSecond: VIDEO_BITRATE,
            })
      } catch (e2) {
        setRecordError(
          e2 instanceof Error
            ? `Kunne ikke starte opptak: ${e2.message}`
            : 'Kunne ikke starte opptak.',
        )
        return false
      }
    }

    mimeRef.current = recorder.mimeType || mimeRef.current
    segmentStartedAtRef.current = Date.now()

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
    }
    recorder.onerror = () => {
      setRecordError('Opptak feilet underveis.')
    }
    // Segment lagres kun via stopCurrentRecorder / stopRecording
    recorder.onstop = () => {
      /* handled by stop helpers */
    }

    try {
      recorder.start(1000)
    } catch (e) {
      setRecordError(
        e instanceof Error
          ? `Kunne ikke starte opptak: ${e.message}`
          : 'Kunne ikke starte opptak.',
      )
      return false
    }

    recorderRef.current = recorder
    return true
  }, [])

  const scheduleRotate = useCallback(() => {
    clearRotateTimer()
    rotateTimerRef.current = setTimeout(() => {
      void rotateSegmentRef.current()
    }, SEGMENT_MS)
  }, [clearRotateTimer])

  const rotateSegment = useCallback(async () => {
    if (!activeRef.current || rotatingRef.current) return
    rotatingRef.current = true
    clearRotateTimer()
    try {
      await stopCurrentRecorder()
      if (activeRef.current && startSegmentRecorder()) {
        scheduleRotate()
      }
    } finally {
      rotatingRef.current = false
    }
  }, [
    clearRotateTimer,
    scheduleRotate,
    startSegmentRecorder,
    stopCurrentRecorder,
  ])

  useEffect(() => {
    rotateSegmentRef.current = rotateSegment
  }, [rotateSegment])

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    activeRef.current = false
    clearRotateTimer()
    clearTick()
    await stopCurrentRecorder()
    setRecording(false)
    await refreshBufferStats()
    return null
  }, [
    clearRotateTimer,
    clearTick,
    refreshBufferStats,
    stopCurrentRecorder,
  ])

  const startRecording = useCallback(async () => {
    setRecordError(null)
    setLastSave(null)

    if (!supported) {
      setRecordError('Videoopptak støttes ikke i denne nettleseren.')
      return
    }
    if (activeRef.current) return

    const stream = getStream()
    if (!stream) {
      setRecordError('Start kamera før du tar opp.')
      return
    }

    await ensureMicrophone(stream)

    const videoTracks = stream
      .getVideoTracks()
      .filter((t) => t.readyState === 'live')
    if (videoTracks.length === 0) {
      setRecordError('Ingen aktiv videostream å ta opp.')
      return
    }

    const audioTracks = stream
      .getAudioTracks()
      .filter((t) => t.readyState === 'live')
    recordStreamRef.current = new MediaStream([
      ...videoTracks,
      ...audioTracks,
    ])

    activeRef.current = true
    sessionIdRef.current = `sess-${Date.now()}`
    loopStartedAtRef.current = Date.now()
    setDurationMs(0)
    setRecording(true)

    if (!startSegmentRecorder()) {
      activeRef.current = false
      setRecording(false)
      return
    }

    clearTick()
    tickRef.current = setInterval(() => {
      setDurationMs(Date.now() - loopStartedAtRef.current)
    }, 250)

    scheduleRotate()
    await refreshBufferStats()
  }, [
    clearTick,
    getStream,
    refreshBufferStats,
    scheduleRotate,
    startSegmentRecorder,
    supported,
  ])

  const stopAndSave = useCallback(async () => {
    await stopRecording()
    return 'library' as const
  }, [stopRecording])

  const toggleRecording = useCallback(() => {
    if (recording) void stopAndSave()
    else void startRecording()
  }, [recording, startRecording, stopAndSave])

  const saveAndClear = useCallback(
    async (_blob: Blob | null) => {
      await refreshBufferStats()
      return 'library' as const
    },
    [refreshBufferStats],
  )

  useEffect(() => {
    return () => {
      activeRef.current = false
      clearRotateTimer()
      clearTick()
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          /* ignore */
        }
      }
      recorderRef.current = null
    }
  }, [clearRotateTimer, clearTick])

  const hours = getRollingHours?.() ?? 1
  const bufferLabel = `${formatRecordingDuration(bufferStats.durationMs)} / ${hours}t`

  return {
    supported,
    recording,
    durationMs,
    durationLabel: formatRecordingDuration(durationMs),
    bufferStats,
    bufferLabel,
    recordError,
    lastSave,
    startRecording,
    stopAndSave,
    stopRecording,
    toggleRecording,
    saveAndClear,
    refreshBufferStats,
  }
}
