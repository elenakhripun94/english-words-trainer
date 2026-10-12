/**
 * 16-bit mono WAV with the silence around the word cut off.
 * Transformers.js writes 32-bit float WAV, which iPhones do not always play.
 */
export function encodeWav16(samples: Float32Array, rate: number): ArrayBuffer {
  const trimmed = trimSilence(samples, rate)
  const buffer = new ArrayBuffer(44 + trimmed.length * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + trimmed.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, trimmed.length * 2, true)
  for (let index = 0; index < trimmed.length; index++) {
    const sample = Math.max(-1, Math.min(1, trimmed[index]))
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return buffer
}

/** Keeps 80 ms of quiet on each side so the word does not start abruptly. */
export function trimSilence(samples: Float32Array, rate: number, threshold = 0.01): Float32Array {
  const pad = Math.round(rate * 0.08)
  let start = 0
  while (start < samples.length && Math.abs(samples[start]) < threshold) start++
  if (start === samples.length) return samples
  let end = samples.length - 1
  while (end > start && Math.abs(samples[end]) < threshold) end--
  return samples.subarray(Math.max(0, start - pad), Math.min(samples.length, end + pad + 1))
}
