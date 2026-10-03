import { afterEach, describe, expect, it, vi } from 'vitest'
import { playTerm } from './speech'

afterEach(() => {
  vi.unstubAllGlobals()
})

class FakeUtterance {
  lang = ''
  rate = 1
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public text: string) {}
}

function stubSpeech() {
  const speak = vi.fn((utterance: FakeUtterance) => {
    utterance.onend?.()
  })
  vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel: vi.fn(), speak })
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  return speak
}

describe('playTerm', () => {
  it('uses speech synthesis when there is no dictionary audio', async () => {
    const speak = stubSpeech()
    await playTerm('apple', null)
    expect(speak).toHaveBeenCalledOnce()
  })

  it('falls back to speech synthesis when audio playback fails', async () => {
    const speak = stubSpeech()
    vi.stubGlobal(
      'Audio',
      class {
        play() {
          return Promise.reject(new Error('blocked'))
        }
      },
    )
    await playTerm('apple', 'https://example.com/apple.mp3')
    expect(speak).toHaveBeenCalledOnce()
  })
})
