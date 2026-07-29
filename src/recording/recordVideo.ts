/** MediaRecorder-hjelpere for dashcam-opptak lokalt i nettleseren. */

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
]

export function isRecordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined'
}

export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return undefined
}

export function extensionForMime(mime: string): string {
  if (mime.includes('mp4')) return 'mp4'
  return 'webm'
}

export function formatRecordingDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function makeRecordingFilename(mime: string, at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  return `dashcam-${stamp}.${extensionForMime(mime)}`
}

/** Del via Web Share API hvis mulig, ellers last ned. */
export async function saveRecordingBlob(
  blob: Blob,
  filename: string,
): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, {
    type: blob.type || 'video/webm',
  })

  try {
    if (
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        files: [file],
        title: 'Dashcam Norge',
        text: 'Opptak fra kjøreturen',
      })
      return 'shared'
    }
  } catch (err) {
    // Bruker avbrøt deling — ikke last ned automatisk
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'AbortError'
    ) {
      downloadBlob(blob, filename)
      return 'downloaded'
    }
  }

  downloadBlob(blob, filename)
  return 'downloaded'
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Gi nettleseren tid til å starte nedlastingen
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
