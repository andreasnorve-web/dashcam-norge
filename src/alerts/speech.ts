let speaking = false
const queue: string[] = []
let lastSpoken = new Map<string, number>()

const COOLDOWN_MS = 12_000

function flush() {
  if (speaking || queue.length === 0) return
  if (!('speechSynthesis' in window)) return

  const text = queue.shift()!
  speaking = true
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'nb-NO'
  utter.rate = 1.05
  utter.pitch = 1
  utter.onend = () => {
    speaking = false
    flush()
  }
  utter.onerror = () => {
    speaking = false
    flush()
  }
  window.speechSynthesis.speak(utter)
}

export function speak(text: string, key?: string, cooldownMs = COOLDOWN_MS) {
  const dedupeKey = key ?? text
  const now = Date.now()
  const last = lastSpoken.get(dedupeKey) ?? 0
  if (now - last < cooldownMs) return
  lastSpoken.set(dedupeKey, now)

  queue.push(text)
  if (queue.length > 6) queue.splice(0, queue.length - 6)
  flush()
}

export function stopSpeech() {
  queue.length = 0
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  speaking = false
}
