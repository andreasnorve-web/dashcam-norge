import type { DetectionBox, LaneLines } from '../types'

/** Romlige prioriteringer for norsk vei (høyrekjøring). */
export interface RoadSearchZones {
  /** Skilt: til høyre for høyre feltlinje, midtre høyde */
  sign: { x0: number; x1: number; y0: number; y1: number }
  /** Bensinpriser: samme side, litt høyere */
  fuel: { x0: number; x1: number; y0: number; y1: number }
  /** Høyre/lav sone (politi/kontroll synlig; laser er her men ikke detekterbar) */
  roadsideLow: { x0: number; x1: number; y0: number; y1: number }
}

export function buildRoadSearchZones(
  width: number,
  height: number,
  lanes: LaneLines,
): RoadSearchZones {
  const rightLaneX = estimateRightLaneX(lanes, width, height)
  // Skilt ligger typisk utenfor høyre veibanemerke
  const signLeft = Math.min(width * 0.92, Math.max(width * 0.42, rightLaneX + width * 0.02))

  return {
    sign: {
      x0: signLeft,
      x1: width,
      y0: height * 0.18,
      y1: height * 0.72,
    },
    fuel: {
      x0: signLeft,
      x1: width,
      y0: height * 0.05,
      y1: height * 0.45,
    },
    roadsideLow: {
      x0: signLeft,
      x1: width,
      y0: height * 0.45,
      y1: height * 0.92,
    },
  }
}

function estimateRightLaneX(
  lanes: LaneLines,
  width: number,
  height: number,
): number {
  const right = lanes.right
  if (!right) return width * 0.55

  // x ved midtre bildehøyde langs feltlinjen
  const y = height * 0.7
  const t =
    Math.abs(right.y2 - right.y1) < 1e-3
      ? 0
      : (y - right.y1) / (right.y2 - right.y1)
  const x = right.x1 + t * (right.x2 - right.x1)
  if (!Number.isFinite(x)) return width * 0.55
  return Math.max(width * 0.35, Math.min(width * 0.85, x))
}

export function boxCenter(box: DetectionBox) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export function inZone(
  box: DetectionBox,
  zone: { x0: number; x1: number; y0: number; y1: number },
) {
  const c = boxCenter(box)
  return c.x >= zone.x0 && c.x <= zone.x1 && c.y >= zone.y0 && c.y <= zone.y1
}

/** Boost score for bokser i forventet sone for kind. */
export function scoreByRoadPosition(
  box: DetectionBox,
  zones: RoadSearchZones,
): number {
  let bonus = 0
  if (box.kind === 'sign' || box.kind === 'info') {
    if (inZone(box, zones.sign)) bonus += 0.35
    else if (boxCenter(box).x > zones.sign.x0) bonus += 0.12
  }
  if (box.kind === 'fuel') {
    if (inZone(box, zones.fuel)) bonus += 0.4
    else if (inZone(box, zones.sign)) bonus += 0.1
  }
  // Kjøretøy/politi: lavt til høyre er mer relevant
  if (
    box.label === 'Bil' ||
    box.label === 'truck' ||
    box.label === 'bus' ||
    box.kind === 'police' ||
    box.kind === 'vegvesen'
  ) {
    if (inZone(box, zones.roadsideLow)) bonus += 0.25
    else if (boxCenter(box).x > zones.roadsideLow.x0) bonus += 0.1
  }
  return box.score + bonus
}
