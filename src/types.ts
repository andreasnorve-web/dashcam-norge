export type AlertKind =
  | 'lane'
  | 'sign'
  | 'info'
  | 'fuel'
  | 'pedestrian'
  | 'police'
  | 'vegvesen'

export interface DetectionBox {
  x: number
  y: number
  width: number
  height: number
  label: string
  score: number
  kind: AlertKind
}

export interface LaneLines {
  left: { x1: number; y1: number; x2: number; y2: number } | null
  right: { x1: number; y1: number; x2: number; y2: number } | null
}

export interface DashcamEvent {
  id: string
  kind: AlertKind
  message: string
  spoken: boolean
  urgent: boolean
  at: number
}

export interface DashcamSettings {
  speakSigns: boolean
  speakFuel: boolean
  alertPedestrians: boolean
  alertPolice: boolean
  alertVegvesen: boolean
  showLanes: boolean
  detectionIntervalMs: number
  ocrIntervalMs: number
}
