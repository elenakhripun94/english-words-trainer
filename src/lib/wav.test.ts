import { describe, expect, it } from 'vitest'
import { encodeWav16, trimSilence } from './wav'

describe('encodeWav16', () => {
  it('writes a 16-bit PCM header', () => {
    const view = new DataView(encodeWav16(new Float32Array([0.5, -0.5, 1, -1]), 24000))
    const text = (offset: number) => String.fromCharCode(...[0, 1, 2, 3].map((index) => view.getUint8(offset + index)))
    expect(text(0)).toBe('RIFF')
    expect(text(8)).toBe('WAVE')
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(24, true)).toBe(24000)
    expect(view.getInt16(44 + 4, true)).toBe(0x7fff)
    expect(view.getInt16(44 + 6, true)).toBe(-0x8000)
  })
})

describe('trimSilence', () => {
  it('cuts quiet edges but keeps a short pad', () => {
    const rate = 1000
    const samples = new Float32Array(1000)
    samples.fill(0.5, 400, 500)
    const trimmed = trimSilence(samples, rate)
    expect(trimmed.length).toBe(100 + 2 * 80)
  })

  it('leaves pure silence alone', () => {
    expect(trimSilence(new Float32Array(10), 1000).length).toBe(10)
  })
})
