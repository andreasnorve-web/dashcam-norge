/** Åpne bakkamera med fallbacks som fungerer bedre i PWA/standalone. */

export function isIosDevice(): boolean {
  const ua = navigator.userAgent
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function isStandaloneDisplay(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return (
    Boolean(nav.standalone) ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  )
}

export function isIosStandalone(): boolean {
  return isIosDevice() && isStandaloneDisplay()
}

export async function openDashcamStream(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error('Kamera krever HTTPS.')
  }

  const getUserMedia = resolveGetUserMedia()
  if (!getUserMedia) {
    throw new Error(
      'Kamera støttes ikke her. Åpne i Safari/Chrome (ikke hjemskjerm-app).',
    )
  }

  // Enklest først. FacingMode/deviceId-bytte feiler ofte i PWA.
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: true },
    { audio: false, video: { facingMode: { ideal: 'environment' } } },
    { audio: false, video: { facingMode: 'environment' } },
  ]

  let lastErr: unknown = null
  let stream: MediaStream | null = null

  for (const constraints of attempts) {
    try {
      stream = await getUserMedia(constraints)
      break
    } catch (err) {
      lastErr = err
    }
  }

  if (!stream) {
    throw mapCameraError(lastErr)
  }

  // Unngå andre getUserMedia-kall i PWA — det kan drepe første stream.
  if (!isStandaloneDisplay() && !isIosDevice()) {
    await preferBackCamera(stream)
  }

  return stream
}

function mapCameraError(lastErr: unknown): Error {
  const name =
    lastErr && typeof lastErr === 'object' && 'name' in lastErr
      ? String((lastErr as { name: string }).name)
      : ''

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return new Error(
      'Kameratilgang blokkert. Tillat kamera for denne siden. På iPhone: Innstillinger → Safari → Kamera → Tillat, og åpne siden i Safari (ikke hjemskjerm).',
    )
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new Error('Fant ingen kamera på enheten.')
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new Error(
      'Kameraet er opptatt av en annen app. Lukk andre kamera-apper og prøv igjen.',
    )
  }
  if (name === 'SecurityError') {
    return new Error(
      'Nettleseren blokkerer kamera i denne app-modusen. Åpne samme adresse i Safari/Chrome.',
    )
  }

  return lastErr instanceof Error
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

export async function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
) {
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
  video.setAttribute('autoplay', 'true')
  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.controls = false
  video.disablePictureInPicture = true

  // Nullstill først — viktig i PWA der gammelt srcObject henger.
  try {
    video.pause()
  } catch {
    /* ignore */
  }
  video.srcObject = null
  video.removeAttribute('src')
  video.load()

  video.srcObject = stream

  const track = stream.getVideoTracks()[0]
  if (track) {
    track.contentHint = 'motion'
    // Noen PWA-er trenger at track er enabled eksplisitt
    track.enabled = true
  }

  await waitForVideoReady(video)

  // Flere play()-forsøk — PWA kan ignorere første.
  for (let i = 0; i < 3; i++) {
    try {
      await video.play()
      break
    } catch {
      await sleep(100)
    }
  }

  // Siste sjekk: har vi faktisk piksler?
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    await sleep(250)
    if (video.videoWidth === 0) {
      throw new Error(
        'Kamera startet, men bildet er tomt i app-modus. Åpne samme adresse i Safari/Chrome i stedet for hjemskjerm-ikonet.',
      )
    }
  }
}

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const done = (ok: boolean, err?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (ok) resolve()
      else reject(err ?? new Error('Videoelementet klarte ikke å vise kameraet.'))
    }

    const onReady = () => done(true)
    const onError = () =>
      done(false, new Error('Videoelementet klarte ikke å vise kameraet.'))

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('error', onError)
      window.clearTimeout(timer)
    }

    video.addEventListener('loadedmetadata', onReady)
    video.addEventListener('loadeddata', onReady)
    video.addEventListener('canplay', onReady)
    video.addEventListener('error', onError)

    // PWA: loadedmetadata kan utebli — fortsett likevel etter timeout.
    const timer = window.setTimeout(() => done(true), 2000)
  })
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
