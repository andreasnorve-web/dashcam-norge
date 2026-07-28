import type { DetectionBox } from '../types'

/** Finn skilt-lignende regioner via farge (rød ring / blå info / gul advarsel). */
export function findSignRegions(
  imageData: ImageData,
  width: number,
  height: number,
): DetectionBox[] {
  const data = imageData.data
  const cell = 16
  const candidates: DetectionBox[] = []

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
        candidates.push({
          x: Math.max(0, cx - cell),
          y: Math.max(0, cy - cell),
          width: cell * 3,
          height: cell * 3,
          label: 'Trafikkskilt',
          score: redRatio,
          kind: 'sign',
        })
      } else if (blueRatio > 0.28) {
        candidates.push({
          x: Math.max(0, cx - cell * 2),
          y: Math.max(0, cy - cell),
          width: cell * 5,
          height: cell * 3,
          label: 'Informasjonsskilt',
          score: blueRatio,
          kind: 'info',
        })
      } else if (yellowRatio > 0.25 && brightRatio < 0.5) {
        candidates.push({
          x: Math.max(0, cx - cell),
          y: Math.max(0, cy - cell),
          width: cell * 4,
          height: cell * 3,
          label: 'Advarselsskilt',
          score: yellowRatio,
          kind: 'sign',
        })
      } else if (brightRatio > 0.45 && cy < height * 0.55) {
        // Mulig LED-prisskilt
        candidates.push({
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

  return mergeBoxes(candidates).slice(0, 8)
}

function mergeBoxes(boxes: DetectionBox[]): DetectionBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score)
  const kept: DetectionBox[] = []
  for (const box of sorted) {
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
