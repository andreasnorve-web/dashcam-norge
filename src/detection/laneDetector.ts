import type { LaneLines } from '../types'

/** Enkel kantbasert feltgjenkjenning i nedre bildehalvdel (mobilvennlig). */
export function detectLanes(
  imageData: ImageData,
  width: number,
  height: number,
): LaneLines {
  const data = imageData.data
  const roiTop = Math.floor(height * 0.55)
  const edges: { x: number; y: number }[] = []

  for (let y = roiTop; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const i = (y * width + x) * 4
      const gray =
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      const right =
        0.299 * data[i + 4] + 0.587 * data[i + 5] + 0.114 * data[i + 6]
      const down =
        0.299 * data[i + width * 4] +
        0.587 * data[i + width * 4 + 1] +
        0.114 * data[i + width * 4 + 2]
      const mag = Math.abs(gray - right) + Math.abs(gray - down)
      if (mag > 55) edges.push({ x, y })
    }
  }

  const mid = width / 2
  const leftPts = edges.filter((p) => p.x < mid - 20)
  const rightPts = edges.filter((p) => p.x > mid + 20)

  return {
    left: fitLine(leftPts, height),
    right: fitLine(rightPts, height),
  }
}

function fitLine(
  pts: { x: number; y: number }[],
  height: number,
): LaneLines['left'] {
  if (pts.length < 40) return null

  // Enkel lineær regresjon y = a + b*x er ustabil for nesten-vertikale felt;
  // vi regresserer x = a + b*y i stedet.
  let sumY = 0
  let sumX = 0
  let sumYY = 0
  let sumYX = 0
  const n = pts.length
  for (const p of pts) {
    sumY += p.y
    sumX += p.x
    sumYY += p.y * p.y
    sumYX += p.y * p.x
  }
  const denom = n * sumYY - sumY * sumY
  if (Math.abs(denom) < 1e-6) return null
  const b = (n * sumYX - sumY * sumX) / denom
  const a = (sumX - b * sumY) / n

  const y1 = Math.floor(height * 0.6)
  const y2 = height - 2
  return { x1: a + b * y1, y1, x2: a + b * y2, y2 }
}
