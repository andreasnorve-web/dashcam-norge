import { useCallback, useEffect, useRef, useState } from 'react'
import { playUrgentBeep } from '../alerts/audioAlert'
import { speak } from '../alerts/speech'
import { detectLanes } from '../detection/laneDetector'
import { detectObjects, loadObjectModel } from '../detection/objectDetector'
import { classifyOcrText, initOcr, readTextFromCanvas } from '../detection/ocr'
import { findSignRegions } from '../detection/signDetector'
import type {
  DashcamEvent,
  DashcamSettings,
  DetectionBox,
  LaneLines,
} from '../types'

const DEFAULT_SETTINGS: DashcamSettings = {
  speakSigns: true,
  speakFuel: true,
  alertPedestrians: true,
  alertPolice: true,
  alertVegvesen: true,
  showLanes: true,
  detectionIntervalMs: 450,
  ocrIntervalMs: 1800,
}

export function useDashcam() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const sampleRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const lastDetectRef = useRef(0)
  const lastOcrRef = useRef(0)
  const boxesRef = useRef<DetectionBox[]>([])
  const lanesRef = useRef<LaneLines>({ left: null, right: null })
  const settingsRef = useRef(DEFAULT_SETTINGS)
  const alertCooldown = useRef(new Map<string, number>())

  const [running, setRunning] = useState(false)
  const [ready, setReady] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('Laster modeller…')
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<DashcamEvent[]>([])
  const [fps, setFps] = useState(0)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoadingMsg('Laster objektdeteksjon…')
        await loadObjectModel()
        if (cancelled) return
        setLoadingMsg('Laster OCR…')
        await initOcr()
        if (cancelled) return
        setReady(true)
        setLoadingMsg('')
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'Kunne ikke laste AI-modeller',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const pushEvent = useCallback(
    (
      kind: DashcamEvent['kind'],
      message: string,
      urgent: boolean,
      shouldSpeak: boolean,
    ) => {
      const key = `${kind}:${message}`
      const now = Date.now()
      const last = alertCooldown.current.get(key) ?? 0
      const cooldown = urgent ? 8000 : 14000
      if (now - last < cooldown) return
      alertCooldown.current.set(key, now)

      const ev: DashcamEvent = {
        id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
        kind,
        message,
        spoken: shouldSpeak,
        urgent,
        at: now,
      }
      setEvents((prev) => [ev, ...prev].slice(0, 30))

      if (shouldSpeak) speak(message, key, cooldown)
      if (urgent) void playUrgentBeep(kind === 'pedestrian' ? 4 : 3)
    },
    [],
  )

  const drawFrame = useCallback(() => {
    const video = videoRef.current
    const overlay = overlayRef.current
    if (!video || !overlay || video.readyState < 2) return

    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return

    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w
      overlay.height = h
    }

    const ctx = overlay.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)

    const lanes = lanesRef.current
    if (settingsRef.current.showLanes) {
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(0, 220, 140, 0.85)'
      for (const line of [lanes.left, lanes.right]) {
        if (!line) continue
        ctx.beginPath()
        ctx.moveTo(line.x1, line.y1)
        ctx.lineTo(line.x2, line.y2)
        ctx.stroke()
      }
    }

    for (const box of boxesRef.current) {
      const color =
        box.kind === 'pedestrian'
          ? '#ff3b3b'
          : box.kind === 'police' || box.kind === 'vegvesen'
            ? '#ffcc00'
            : box.kind === 'fuel'
              ? '#6ecbff'
              : '#ffffff'
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(box.x, box.y, box.width, box.height)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(box.x, Math.max(0, box.y - 22), Math.min(220, box.width + 8), 22)
      ctx.fillStyle = color
      ctx.font = '14px ui-sans-serif, system-ui'
      ctx.fillText(
        `${box.label} ${Math.round(box.score * 100)}%`,
        box.x + 4,
        Math.max(14, box.y - 6),
      )
    }
  }, [])

  const runDetection = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return

    const sample =
      sampleRef.current ??
      (sampleRef.current = document.createElement('canvas'))
    const maxW = 480
    const scale = Math.min(1, maxW / video.videoWidth)
    const sw = Math.floor(video.videoWidth * scale)
    const sh = Math.floor(video.videoHeight * scale)
    sample.width = sw
    sample.height = sh
    const sctx = sample.getContext('2d', { willReadFrequently: true })
    if (!sctx) return
    sctx.drawImage(video, 0, 0, sw, sh)

    const imageData = sctx.getImageData(0, 0, sw, sh)
    const lanes = detectLanes(imageData, sw, sh)
    const inv = 1 / scale
    lanesRef.current = {
      left: lanes.left
        ? {
            x1: lanes.left.x1 * inv,
            y1: lanes.left.y1 * inv,
            x2: lanes.left.x2 * inv,
            y2: lanes.left.y2 * inv,
          }
        : null,
      right: lanes.right
        ? {
            x1: lanes.right.x1 * inv,
            y1: lanes.right.y1 * inv,
            x2: lanes.right.x2 * inv,
            y2: lanes.right.y2 * inv,
          }
        : null,
    }

    const objects = await detectObjects(sample)
    const signs = findSignRegions(imageData, sw, sh)
    const scaled: DetectionBox[] = [...objects, ...signs].map((b) => ({
      ...b,
      x: b.x * inv,
      y: b.y * inv,
      width: b.width * inv,
      height: b.height * inv,
    }))
    boxesRef.current = scaled

    const cfg = settingsRef.current
    for (const box of scaled) {
      if (box.kind === 'pedestrian' && cfg.alertPedestrians) {
        pushEvent('pedestrian', 'Fotgjenger foran — vær oppmerksom', true, true)
      }
    }

    // Vis funn i Hendelser også når OCR ikke har lest tekst ennå
    for (const box of scaled) {
      if (box.kind === 'sign') {
        pushEvent('sign', 'Skilt oppdaget', false, false)
      } else if (box.kind === 'info') {
        pushEvent('info', 'Informasjonsskilt oppdaget', false, false)
      } else if (box.kind === 'fuel') {
        pushEvent('fuel', 'Mulig bensinpris / prisskilt', false, false)
      }
    }

    const now = Date.now()
    if (now - lastOcrRef.current >= cfg.ocrIntervalMs) {
      lastOcrRef.current = now
      const ocrTargets = scaled
        .filter(
          (b) =>
            b.kind === 'sign' ||
            b.kind === 'info' ||
            b.kind === 'fuel' ||
            b.label === 'Bil' ||
            b.label === 'truck' ||
            b.label === 'bus',
        )
        .slice(0, 3)

      for (const target of ocrTargets) {
        const crop = document.createElement('canvas')
        const cw = Math.max(40, Math.floor(target.width * scale))
        const ch = Math.max(40, Math.floor(target.height * scale))
        crop.width = cw
        crop.height = ch
        const cctx = crop.getContext('2d')
        if (!cctx) continue
        cctx.drawImage(
          sample,
          target.x * scale,
          target.y * scale,
          cw,
          ch,
          0,
          0,
          cw,
          ch,
        )
        const text = await readTextFromCanvas(crop)
        if (!text || text.length < 3) continue
        const classified = classifyOcrText(text)
        if (!classified.kind) continue

        if (classified.kind === 'police' && cfg.alertPolice) {
          pushEvent('police', classified.message, true, true)
          target.kind = 'police'
          target.label = 'Politi'
        } else if (classified.kind === 'vegvesen' && cfg.alertVegvesen) {
          pushEvent('vegvesen', classified.message, true, true)
          target.kind = 'vegvesen'
          target.label = 'Vegvesen'
        } else if (classified.kind === 'fuel') {
          pushEvent('fuel', classified.message, false, cfg.speakFuel)
          target.kind = 'fuel'
          target.label = classified.message
        } else if (classified.kind === 'sign') {
          pushEvent('sign', classified.message, false, cfg.speakSigns)
          target.label = classified.message
        } else if (classified.kind === 'info') {
          pushEvent('info', classified.message, false, cfg.speakSigns)
          target.label = 'Info'
        }
      }
      boxesRef.current = [...scaled]
    }
  }, [pushEvent])

  const loop = useCallback(() => {
    const start = performance.now()
    drawFrame()
    const now = Date.now()
    if (now - lastDetectRef.current >= settingsRef.current.detectionIntervalMs) {
      lastDetectRef.current = now
      void runDetection().then(() => {
        const elapsed = performance.now() - start
        setFps(Math.round(1000 / Math.max(elapsed, 1)))
      })
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [drawFrame, runDetection])

  const start = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      setRunning(true)
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(loop)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Kamera tilgang ble avslått. Bruk HTTPS og tillat kamera.',
      )
    }
  }, [loop])

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    boxesRef.current = []
    lanesRef.current = { left: null, right: null }
    setRunning(false)
  }, [])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return {
    videoRef,
    overlayRef,
    running,
    ready,
    loadingMsg,
    error,
    events,
    fps,
    settings,
    setSettings,
    start,
    stop,
  }
}
