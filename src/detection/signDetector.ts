import type { DetectionBox, LaneLines } from '../types'
import {
  buildRoadSearchZones,
  inZone,
  scoreByRoadPosition,
  type RoadSearchZones,
} from './roadRoi'

/** Finn skilt-lignende regioner, prioritert til høyre for høyre feltlinje. */
export function findSignRegions(
  imageData: ImageData,
  width: number,
  height: number,
  lanes?: LaneLines,
): DetectionBox[] {
  const data = imageData.data
  const cell = 16
  const candidates: DetectionBox[] = []
  const zones = buildRoadSearchZones(width, height, lanes ?? { left: null, right: null })

  // Skann hele bildet, men krev at treff ligger i relevante soner
  for (let cy = 0; cy < height - cell; cy += cell) {
    for (let cx = 0; cx < width - cell; cx += cell) {
      let red = 0
      let blue = 0
      let yellow = 0
      let bright = 0
      let n = 0

      for (let y = cy; y < cy + cell; y += 2) {
        for (let x = cx; x < cx + cell; x += 2) {
          const i = (y * width + x) * 4
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const sat = max === 0 ? 0 : (max - min) / max
          n++

          if (r > 140 && r > g * 1.35 && r > b * 1.35 && sat > 0.35) red++
          if (b > 120 && b > r * 1.2 && b > g * 1.05 && sat > 0.25) blue++
          if (r > 150 && g > 130 && b < 110 && r - b > 40) yellow++
          if (r > 200 && g > 200 && b > 200) bright++
        }
      }

      const redRatio = red / n
      const blueRatio = blue / n
      const yellowRatio = yellow / n
      const brightRatio = bright / n

      if (redRatio > 0.22) {
        pushIfRelevant(candidates, zones, {
          x: Math.max(0, cx - cell),
          y: Math.max(0, cy - cell),
          width: cell * 3,
          height: cell * 3,
          label: 'Trafikkskilt',
          score: redRatio,
          kind: 'sign',
        })
      } else if (blueRatio > 0.28) {
        pushIfRelevant(candidates, zones, {
          x: Math.max(0, cx - cell * 2),
          y: Math.max(0, cy - cell),
          width: cell * 5,
          height: cell * 3,
          label: 'Informasjonsskilt',
          score: blueRatio,
          kind: 'info',
        })
      } else if (yellowRatio > 0.25 && brightRatio < 0.5) {
        pushIfRelevant(candidates, zones, {
          x: Math.max(0, cx - cell),
          y: Math.max(0, cy - cell),
          width: cell * 4,
          height: cell * 3,
          label: 'Advarselsskilt',
          score: yellowRatio,
          kind: 'sign',
        })
      } else if (brightRatio > 0.45) {
        pushIfRelevant(candidates, zones, {
          x: Math.max(0, cx - cell * 2),
          y: Math.max(0, cy - cell),
          width: cell * 6,
          height: cell * 3,
          label: 'Mulig prisskilt',
          score: brightRatio,
          kind: 'fuel',
        })
      }
    }
  }

  return mergeBoxes(
    candidates
      .map((b) => ({ ...b, score: scoreByRoadPosition(b, zones) }))
      .sort((a, b) => b.score - a.score),
  ).slice(0, 8)
}

function pushIfRelevant(
  list: DetectionBox[],
  zones: RoadSearchZones,
  box: DetectionBox,
) {
  if (box.kind === 'fuel') {
    // Bensinpriser: høyere opp, til høyre
    if (!inZone(box, zones.fuel) && !inZone(box, zones.sign)) return
  } else if (box.kind === 'sign' || box.kind === 'info') {
    // Skilt: til høyre for høyre feltlinje (sign-sone + litt overlapp lavt)
    if (
      !inZone(box, zones.sign) &&
      !inZone(box, zones.fuel) &&
      !inZone(box, zones.roadsideLow)
    ) {
      return
    }
  }
  list.push(box)
}

function mergeBoxes(boxes: DetectionBox[]): DetectionBox[] {
  const kept: DetectionBox[] = []
  for (const box of boxes) {
    const overlaps = kept.some((k) => iou(k, box) > 0.35)
    if (!overlaps) kept.push(box)
  }
  return kept
}

function iou(a: DetectionBox, b: DetectionBox) {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = a.width * a.height + b.width * b.height - inter
  return union <= 0 ? 0 : inter / union
}
