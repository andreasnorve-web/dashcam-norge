import type { AlertKind } from '../types'

export type SignIllustration =
  | { type: 'speed'; value: number }
  | { type: 'info'; text: string }
  | { type: 'fuel'; fuel: 'Bensin' | 'Diesel'; price: string }
  | { type: 'generic-sign' }
  | { type: 'generic-info' }
  | { type: 'generic-fuel' }

export function illustrationFromEvent(
  kind: AlertKind,
  message: string,
): SignIllustration | null {
  if (kind === 'sign') {
    const m = message.match(/fartsgrense\s+(\d{2,3})/i)
    if (m) return { type: 'speed', value: Number(m[1]) }
    return { type: 'generic-sign' }
  }
  if (kind === 'info') {
    const text = message.replace(/^Info:\s*/i, '').trim() || 'Informasjon'
    return { type: 'info', text: text.slice(0, 48) }
  }
  if (kind === 'fuel') {
    const m = message.match(/(Bensin|Diesel)\s+(\d{1,2}[.,]\d{2})/i)
    if (m) {
      return {
        type: 'fuel',
        fuel: /diesel/i.test(m[1]) ? 'Diesel' : 'Bensin',
        price: m[2].replace(',', '.'),
      }
    }
    return { type: 'generic-fuel' }
  }
  return null
}
