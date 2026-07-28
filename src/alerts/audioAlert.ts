let ctx: AudioContext | null = null

function getCtx() {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/** Skarp varsellyd for fotgjenger / politi / vegvesen */
export async function playUrgentBeep(times = 3) {
  const audio = getCtx()
  if (audio.state === 'suspended') await audio.resume()

  for (let i = 0; i < times; i++) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'square'
    osc.frequency.value = i % 2 === 0 ? 880 : 660
    gain.gain.value = 0.08
    osc.connect(gain)
    gain.connect(audio.destination)
    const t = audio.currentTime + i * 0.22
    osc.start(t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    osc.stop(t + 0.18)
  }
}
