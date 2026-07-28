/** Åpne bakkamera med fallbacks som fungerer bedre i PWA/standalone. */
export async function openDashcamStream(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error('Kamera krever HTTPS.')
  }

  const getUserMedia = resolveGetUserMedia()
  if (!getUserMedia) {
    throw new Error(
      'Kamera støttes ikke i denne PWA-en. Åpne i Safari/Chrome i stedet.',
    )
  }

  const attempts: MediaStreamConstraints[] = [
    // Enklest først — færre feil i iOS PWA
    { audio: false, video: true },
    { audio: false, video: { facingMode: 'environment' } },
    {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
  ]

  let lastErr: unknown = null
  for (const constraints of attempts) {
    try {
      const stream = await getUserMedia(constraints)
      await preferBackCamera(stream)
      return stream
    } catch (err) {
      lastErr = err
    }
  }

  const name =
    lastErr && typeof lastErr === 'object' && 'name' in lastErr
      ? String((lastErr as { name: string }).name)
      : ''

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    throw new Error(
      'Kameratilgang blokkert. På iPhone: Innstillinger → Safari → Kamera → Tillat. Åpne siden i Safari (ikke hjemskjerm-app), tillat kamera, prøv igjen.',
    )
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    throw new Error('Fant ingen kamera på enheten.')
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    throw new Error(
      'Kameraet er opptatt av en annen app. Lukk andre kamera-apper og prøv igjen.',
    )
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('Kunne ikke starte kameraet.')
}

function resolveGetUserMedia():
  | ((c: MediaStreamConstraints) => Promise<MediaStream>)
  | null {
  if (navigator.mediaDevices?.getUserMedia) {
    return (c) => navigator.mediaDevices.getUserMedia(c)
  }
  const nav = navigator as Navigator & {
    webkitGetUserMedia?: (
      c: MediaStreamConstraints,
      ok: (s: MediaStream) => void,
      err: (e: Error) => void,
    ) => void
  }
  if (nav.webkitGetUserMedia) {
    return (c) =>
      new Promise((resolve, reject) => {
        nav.webkitGetUserMedia!(c, resolve, reject)
      })
  }
  return null
}

async function preferBackCamera(stream: MediaStream) {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const devices = await navigator.mediaDevices.enumerateDevices()
    const back = devices.find(
      (d) =>
        d.kind === 'videoinput' &&
        /back|rear|environment|bak|posterior/i.test(d.label),
    )
    if (!back?.deviceId) return

    const current = stream.getVideoTracks()[0]
    if (!current) return
    if (current.getSettings().deviceId === back.deviceId) return

    const next = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: back.deviceId } },
    })
    current.stop()
    stream.removeTrack(current)
    const track = next.getVideoTracks()[0]
    if (track) stream.addTrack(track)
  } catch {
    // Behold original stream
  }
}

export function isIosStandalone(): boolean {
  const ua = navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone =
    ('standalone' in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)) ||
    window.matchMedia('(display-mode: standalone)').matches
  return isIOS && standalone
}

export async function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
) {
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
  video.setAttribute('autoplay', 'true')
  video.muted = true
  video.playsInline = true
  video.srcObject = stream

  if (video.readyState < 1) {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('Videoelementet klarte ikke å vise kameraet.'))
      }
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onReady)
        video.removeEventListener('error', onError)
      }
      video.addEventListener('loadedmetadata', onReady)
      video.addEventListener('error', onError)
    })
  }

  try {
    await video.play()
  } catch {
    await new Promise((r) => setTimeout(r, 80))
    await video.play()
  }
}
