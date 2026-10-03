let currentAudio: HTMLAudioElement | null = null
let currentUtterance: SpeechSynthesisUtterance | null = null

export function primeSpeech(): void {
  const synth = window.speechSynthesis
  if (!synth) return
  synth.getVoices()
}

primeSpeech()
window.speechSynthesis?.addEventListener?.('voiceschanged', primeSpeech)

export async function playTerm(
  term: string,
  audioUrl?: string | null,
  options?: { rate?: number },
): Promise<void> {
  stopAudio()
  const rate = options?.rate ?? 1
  if (audioUrl && rate === 1) {
    const played = await playUrl(audioUrl)
    if (played) return
  }
  await speak(term, rate)
}

export function speak(term: string, rate = 1): Promise<void> {
  const synth = window.speechSynthesis
  if (!synth) return Promise.resolve()

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }

    let waitedForVoices = false
    const start = (voice: SpeechSynthesisVoice | undefined, allowRetry: boolean) => {
      const utterance = new SpeechSynthesisUtterance(term)
      currentUtterance = utterance
      utterance.lang = voice?.lang ?? 'en-US'
      utterance.rate = rate
      utterance.volume = 1
      if (voice) utterance.voice = voice
      utterance.onend = () => {
        if (currentUtterance === utterance) currentUtterance = null
        finish()
      }
      utterance.onerror = () => {
        if (allowRetry && voice) {
          start(undefined, false)
          return
        }
        finish()
      }
      const hadVoices = synth.getVoices().length > 0
      synth.speak(utterance)
      if (synth.paused) synth.resume()
      if (!hadVoices && !waitedForVoices) {
        waitedForVoices = true
        const onVoices = () => {
          synth.removeEventListener('voiceschanged', onVoices)
          if (settled || synth.speaking) return
          start(pickVoice(synth.getVoices()), false)
        }
        synth.addEventListener('voiceschanged', onVoices)
      }
    }

    const begin = () => start(pickVoice(synth.getVoices()), true)
    if (synth.speaking || synth.pending) {
      synth.cancel()
      window.setTimeout(begin, 50)
      return
    }
    begin()
  })
}

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'))
  const score = (voice: SpeechSynthesisVoice) => {
    const lang = voice.lang.toLowerCase()
    const name = voice.name.toLowerCase()
    let value = 0
    if (voice.localService) value += 100
    if (lang.startsWith('en-us')) value += 20
    else if (lang.startsWith('en-gb')) value += 10
    if (name.includes('(')) value -= 40
    if (/samantha|саманта|alex|алекс|daniel|дэниэл|даниэл|karen|карен|moira|мойра|victoria|fred|фред/.test(name)) {
      value += 15
    }
    return value
  }
  return [...english].sort((a, b) => score(b) - score(a))[0]
}

function playUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(url.startsWith('//') ? `https:${url}` : url)
    currentAudio = audio
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      if (!ok && currentAudio === audio) currentAudio = null
      resolve(ok)
    }
    audio.onerror = () => finish(false)
    audio.onended = () => finish(true)
    void audio.play().catch(() => finish(false))
  })
}

function stopAudio() {
  if (!currentAudio) return
  currentAudio.pause()
  currentAudio.src = ''
  currentAudio = null
}
