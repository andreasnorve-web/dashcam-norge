import { useCallback, useEffect, useRef, useState } from 'react'
import {
  formatRecordingDuration,
  isRecordingSupported,
  makeRecordingFilename,
  pickRecorderMimeType,
  saveRecordingBlob,
} from '../recording/recordVideo'

export type RecordingSaveResult = 'shared' | 'downloaded' | null

export function useVideoRecorder(getStream: () => MediaStream | null) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef('video/webm')
  const startedAtRef = useRef(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopResolverRef = useRef<((blob: Blob | null) => void) | null>(null)

  const [recording, setRecording] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  const [recordError, setRecordError] = useState<string | null>(null)
  const [lastSave, setLastSave] = useState<RecordingSaveResult>(null)
  const supported = isRecordingSupported()

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const finalizeBlob = useCallback((): Blob | null => {
    const chunks = chunksRef.current
    chunksRef.current = []
    if (chunks.length === 0) return null
    return new Blob(chunks, { type: mimeRef.current })
  }, [])

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      clearTick()
      setRecording(false)
      return null
    }

    return new Promise((resolve) => {
      stopResolverRef.current = resolve
      try {
        if (recorder.state === 'recording') recorder.requestData()
        recorder.stop()
      } catch {
        clearTick()
        setRecording(false)
        recorderRef.current = null
        const blob = finalizeBlob()
        stopResolverRef.current = null
        resolve(blob)
      }
    })
  }, [clearTick, finalizeBlob])

  const saveAndClear = useCallback(async (blob: Blob | null) => {
    if (!blob || blob.size < 64) {
      setRecordError('Opptaket ble tomt — prøv igjen.')
      return null
    }
    const filename = makeRecordingFilename(blob.type || mimeRef.current)
    try {
      const result = await saveRecordingBlob(blob, filename)
      setLastSave(result)
      setRecordError(null)
      return result
    } catch (e) {
      setRecordError(
        e instanceof Error ? e.message : 'Kunne ikke lagre opptaket.',
      )
      return null
    }
  }, [])

  const startRecording = useCallback(() => {
    setRecordError(null)
    setLastSave(null)

    if (!supported) {
      setRecordError('Videoopptak støttes ikke i denne nettleseren.')
      return
    }

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      return
    }

    const stream = getStream()
    if (!stream) {
      setRecordError('Start kamera før du tar opp.')
      return
    }

    const videoTracks = stream.getVideoTracks().filter((t) => t.readyState === 'live')
    if (videoTracks.length === 0) {
      setRecordError('Ingen aktiv videostream å ta opp.')
      return
    }

    // Opptak kun av live tracks — unngå å lagre stoppede tracks
    const recordStream = new MediaStream(videoTracks)
    const mime = pickRecorderMimeType()
    mimeRef.current = mime ?? 'video/webm'
    chunksRef.current = []

    let recorder: MediaRecorder
    try {
      recorder = mime
        ? new MediaRecorder(recordStream, {
            mimeType: mime,
            videoBitsPerSecond: 2_500_000,
          })
        : new MediaRecorder(recordStream, { videoBitsPerSecond: 2_500_000 })
    } catch (e) {
      setRecordError(
        e instanceof Error
          ? `Kunne ikke starte opptak: ${e.message}`
          : 'Kunne ikke starte opptak.',
      )
      return
    }

    mimeRef.current = recorder.mimeType || mimeRef.current

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
    }

    recorder.onerror = () => {
      setRecordError('Opptak feilet underveis.')
      clearTick()
      setRecording(false)
      recorderRef.current = null
      const resolver = stopResolverRef.current
      stopResolverRef.current = null
      resolver?.(finalizeBlob())
    }

    recorder.onstop = () => {
      clearTick()
      setRecording(false)
      recorderRef.current = null
      const blob = finalizeBlob()
      const resolver = stopResolverRef.current
      stopResolverRef.current = null
      if (resolver) {
        resolver(blob)
      } else {
        void saveAndClear(blob)
      }
    }

    try {
      // timeslice: jevnlige chunks så lange opptak ikke går tapt ved krasj
      recorder.start(1000)
    } catch (e) {
      setRecordError(
        e instanceof Error
          ? `Kunne ikke starte opptak: ${e.message}`
          : 'Kunne ikke starte opptak.',
      )
      return
    }

    recorderRef.current = recorder
    startedAtRef.current = Date.now()
    setDurationMs(0)
    setRecording(true)
    clearTick()
    tickRef.current = setInterval(() => {
      setDurationMs(Date.now() - startedAtRef.current)
    }, 250)
  }, [clearTick, finalizeBlob, getStream, saveAndClear, supported])

  const stopAndSave = useCallback(async () => {
    const blob = await stopRecording()
    return saveAndClear(blob)
  }, [saveAndClear, stopRecording])

  const toggleRecording = useCallback(() => {
    if (recording) void stopAndSave()
    else startRecording()
  }, [recording, startRecording, stopAndSave])

  useEffect(() => {
    return () => {
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
  }, [clearTick])

  return {
    supported,
    recording,
    durationMs,
    durationLabel: formatRecordingDuration(durationMs),
    recordError,
    lastSave,
    startRecording,
    stopAndSave,
    /** Stopp uten lagring (f.eks. ved kamera-stopp der vi likevel lagrer eksplisitt) */
    stopRecording,
    toggleRecording,
    saveAndClear,
  }
}
