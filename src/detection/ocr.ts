import Tesseract from 'tesseract.js'

let worker: Tesseract.Worker | null = null
let busy = false

export async function initOcr() {
  if (worker) return worker
  worker = await Tesseract.createWorker('nor+eng', 1, {
    logger: () => undefined,
  })
  await worker.setParameters({
    tessedit_char_whitelist:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅabcdefghijklmnopqrstuvwxyzæøå0123456789.,:-/% ',
  })
  return worker
}

export async function readTextFromCanvas(
  canvas: HTMLCanvasElement,
): Promise<string> {
  if (busy) return ''
  busy = true
  try {
    const w = await initOcr()
    const { data } = await w.recognize(canvas)
    return (data.text || '').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  } finally {
    busy = false
  }
}

export function classifyOcrText(text: string): {
  kind: 'fuel' | 'police' | 'vegvesen' | 'sign' | 'info' | null
  message: string
} {
  const upper = text.toUpperCase()

  if (/\bPOLITI\b/.test(upper) || /\bPOLICE\b/.test(upper)) {
    return { kind: 'police', message: 'Politi oppdaget' }
  }
  if (
    /\bVEGVESEN\b/.test(upper) ||
    /\bSTATENS VEGVESEN\b/.test(upper) ||
    /\bSVV\b/.test(upper)
  ) {
    return { kind: 'vegvesen', message: 'Statens vegvesen oppdaget' }
  }

  const fuelMatch = upper.match(
    /(?:BENSIN|DIESEL|98|95)\D{0,8}(\d{1,2}[.,]\d{2})/,
  )
  const priceOnly = upper.match(/\b(\d{1,2}[.,]\d{2})\b/)
  if (fuelMatch || (/(?:BENSIN|DIESEL|DRIVSTOFF)/.test(upper) && priceOnly)) {
    const price = (fuelMatch?.[1] || priceOnly?.[1] || '').replace(',', '.')
    const fuel = /DIESEL/.test(upper) ? 'Diesel' : 'Bensin'
    return {
      kind: 'fuel',
      message: `${fuel} ${price} kroner`,
    }
  }

  const speed = upper.match(/\b(\d{2,3})\b/)
  if (
    speed &&
    /(?:KM|FART|HASTIGHET|MAX|MAKS)/.test(upper) &&
    Number(speed[1]) >= 20 &&
    Number(speed[1]) <= 130
  ) {
    return {
      kind: 'sign',
      message: `Fartsgrense ${speed[1]}`,
    }
  }

  if (
    /(?:EXIT|AVKJØRING|AVKJØRSEL|PARKERING|SENTRUM|LUFTHAVN|SYKEHUS|INFO)/.test(
      upper,
    )
  ) {
    const short = text.slice(0, 80)
    return { kind: 'info', message: `Informasjonsskilt: ${short}` }
  }

  // Isolert fartsgrense-tall i skilt-ROI
  if (speed && Number(speed[1]) >= 30 && Number(speed[1]) <= 110) {
    const n = Number(speed[1])
    if ([30, 40, 50, 60, 70, 80, 90, 100, 110].includes(n)) {
      return { kind: 'sign', message: `Fartsgrense ${n}` }
    }
  }

  return { kind: null, message: '' }
}
