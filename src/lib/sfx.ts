/** Short synthesized sounds for right and wrong answers. No audio files to load. */
let context: AudioContext | null = null

function audio(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  context ??= new Ctor()
  if (context.state === 'suspended') void context.resume()
  return context
}

function tone(frequency: number, start: number, length: number, type: OscillatorType = 'sine') {
  const ctx = audio()
  if (!ctx) return
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  const at = ctx.currentTime + start
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(at)
  oscillator.stop(at + length + 0.05)
}

export function playSuccess() {
  tone(660, 0, 0.15)
  tone(880, 0.12, 0.25)
}

export function playError() {
  tone(220, 0, 0.3, 'triangle')
}

export function playPop() {
  tone(520, 0, 0.08, 'square')
}
