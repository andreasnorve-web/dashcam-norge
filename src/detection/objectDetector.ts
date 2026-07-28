import * as cocoSsd from '@tensorflow-models/coco-ssd'
import '@tensorflow/tfjs'
import type { DetectionBox } from '../types'

let model: cocoSsd.ObjectDetection | null = null

export async function loadObjectModel() {
  if (model) return model
  model = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
  return model
}

const PERSON_SCORE = 0.45
const VEHICLE_SCORE = 0.4

export async function detectObjects(
  source: HTMLVideoElement | HTMLCanvasElement,
): Promise<DetectionBox[]> {
  const m = await loadObjectModel()
  const preds = await m.detect(source, 15)
  const out: DetectionBox[] = []

  for (const p of preds) {
    const [x, y, width, height] = p.bbox
    if (p.class === 'person' && p.score >= PERSON_SCORE) {
      out.push({
        x,
        y,
        width,
        height,
        label: 'Fotgjenger',
        score: p.score,
        kind: 'pedestrian',
      })
    } else if (
      (p.class === 'car' ||
        p.class === 'truck' ||
        p.class === 'bus' ||
        p.class === 'motorcycle') &&
      p.score >= VEHICLE_SCORE
    ) {
      out.push({
        x,
        y,
        width,
        height,
        label: p.class === 'car' ? 'Bil' : p.class,
        score: p.score,
        kind: 'sign', // placeholder; refined by OCR on crop
      })
    }
  }
  return out
}
