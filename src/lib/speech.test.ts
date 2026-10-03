import { afterEach, describe, expect, it, vi } from 'vitest'
import { playTerm } from './speech'

afterEach(() => {
  vi.unstubAllGlobals()
})

class FakeUtterance {
  lang = ''
  rate = 1
  volume = 1
  voice: { name: string; lang: string; localService?: boolean } | undefined
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public text: string) {}
}

function stubSpeech() {
  const speak = vi.fn((utterance: FakeUtterance) => {
    utterance.onend?.()
  })
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [],
    cancel: vi.fn(),
    speak,
    speaking: false,
    pending: false,
    paused: false,
    addEventListener: vi.fn(),
  })
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

  it('prefers a local English voice over a remote one', async () => {
    const speak = vi.fn((utterance: FakeUtterance) => {
      utterance.onend?.()
    })
    const remote = { lang: 'en-GB', localService: false, name: 'Google UK' }
    const local = { lang: 'en-US', localService: true, name: 'Samantha' }
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [remote, local],
      cancel: vi.fn(),
      speak,
      speaking: false,
      pending: false,
      paused: false,
      addEventListener: vi.fn(),
    })
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    await playTerm('beach', null)
    expect(speak.mock.calls[0]?.[0].voice).toBe(local)
  })

  it('prefers a system voice over a macOS novelty voice', async () => {
    const speak = vi.fn((utterance: FakeUtterance) => {
      utterance.onend?.()
    })
    const novelty = { lang: 'en-US', localService: true, name: 'Eddy (English (United States))' }
    const system = { lang: 'en-US', localService: true, name: 'Samantha' }
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [novelty, system],
      cancel: vi.fn(),
      speak,
      speaking: false,
      pending: false,
      paused: false,
      addEventListener: vi.fn(),
    })
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    await playTerm('beach', null)
    expect(speak.mock.calls[0]?.[0].voice).toBe(system)
  })
})
