import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureMicrophone } from '../camera/openCamera'
import {
  formatRecordingDuration,
  isRecordingSupported,
  makeRecordingFilename,
  pickRecorderMimeType,
} from '../recording/recordVideo'
import { saveRecording, type RecordingMeta } from '../recording/library'

export type RecordingSaveResult = 'library' | null

export function useVideoRecorder(
  getStream: () => MediaStream | null,
  onLibrarySaved?: (meta: RecordingMeta) => void,
) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef('video/webm')
  const startedAtRef = useRef(0)
  const durationAtStopRef = useRef(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopResolverRef = useRef<((blob: Blob | null) => void) | null>(null)
  const onSavedRef = useRef(onLibrarySaved)

  useEffect(() => {
    onSavedRef.current = onLibrarySaved
  }, [onLibrarySaved])

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

    durationAtStopRef.current = Date.now() - startedAtRef.current

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
      const meta = await saveRecording({
        blob,
        name: filename,
        durationMs: durationAtStopRef.current || undefined,
      })
      setLastSave('library')
      setRecordError(null)
      onSavedRef.current?.(meta)
      return 'library' as const
    } catch (e) {
      setRecordError(
        e instanceof Error ? e.message : 'Kunne ikke lagre opptaket.',
      )
      return null
    }
  }, [])

  const startRecording = useCallback(async () => {
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

    // Be om mikrofon hvis den mangler — videoopptak fortsetter uten lyd ved nei.
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
    const recordStream = new MediaStream([...videoTracks, ...audioTracks])
    const mime = pickRecorderMimeType()
    mimeRef.current = mime ?? 'video/webm'
    chunksRef.current = []

    const recorderOpts: MediaRecorderOptions = {
      videoBitsPerSecond: 2_500_000,
      audioBitsPerSecond: 128_000,
    }
    if (mime) recorderOpts.mimeType = mime

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(recordStream, recorderOpts)
    } catch (e) {
      // Noen nettlesere feiler med audioBits når det mangler lydspor
      try {
        recorder = mime
          ? new MediaRecorder(recordStream, {
              mimeType: mime,
              videoBitsPerSecond: 2_500_000,
            })
          : new MediaRecorder(recordStream, { videoBitsPerSecond: 2_500_000 })
      } catch (e2) {
        setRecordError(
          e2 instanceof Error
            ? `Kunne ikke starte opptak: ${e2.message}`
            : 'Kunne ikke starte opptak.',
        )
        return
      }
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
    durationAtStopRef.current = 0
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
    else void startRecording()
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
    stopRecording,
    toggleRecording,
    saveAndClear,
  }
}
