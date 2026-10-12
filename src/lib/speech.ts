let currentAudio: HTMLAudioElement | null = null
let currentUtterance: SpeechSynthesisUtterance | null = null
// Every new sound gets a number. A sound that was cut off must not fall back to the browser voice
// or retry with another voice: that made one word sound several times in different voices.
let generation = 0
const stopped = new WeakSet<HTMLAudioElement>()

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
  const mine = interrupt()
  const rate = options?.rate ?? 1
  if (audioUrl && rate === 1) {
    const played = await playUrl(audioUrl)
    if (played || mine !== generation) return
  }
  await speak(term, rate)
}

/** Reads an instruction aloud in Russian for a child who cannot read yet. */
export function sayRu(text: string): Promise<void> {
  interrupt()
  return speak(text, 1, 'ru')
}

export function stopSpeech(): void {
  interrupt()
}

/** Silences whatever is playing and starts a new generation. */
function interrupt() {
  generation += 1
  stopAudio()
  const synth = window.speechSynthesis
  if (synth?.speaking || synth?.pending) synth.cancel()
  currentUtterance = null
  return generation
}

export function speak(term: string, rate = 1, language = 'en'): Promise<void> {
  const synth = window.speechSynthesis
  if (!synth) return Promise.resolve()
  const mine = generation

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }

    let waitedForVoices = false
    const start = (voice: SpeechSynthesisVoice | undefined, allowRetry: boolean) => {
      if (mine !== generation) {
        finish()
        return
      }
      const utterance = new SpeechSynthesisUtterance(term)
      currentUtterance = utterance
      utterance.lang = voice?.lang ?? (language === 'ru' ? 'ru-RU' : 'en-US')
      utterance.rate = rate
      utterance.volume = 1
      if (voice) utterance.voice = voice
      utterance.onend = () => {
        if (currentUtterance === utterance) currentUtterance = null
        finish()
      }
      utterance.onerror = (event) => {
        if (currentUtterance === utterance) currentUtterance = null
        // Cut off on purpose: say nothing more.
        const cut = event?.error === 'interrupted' || event?.error === 'canceled'
        if (allowRetry && voice && !cut && mine === generation) {
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
          if (settled || synth.speaking || mine !== generation) return
          start(pickVoice(synth.getVoices(), language), false)
        }
        synth.addEventListener('voiceschanged', onVoices)
      }
    }

    const begin = () => start(pickVoice(synth.getVoices(), language), true)
    if (synth.speaking || synth.pending) {
      synth.cancel()
      window.setTimeout(begin, 50)
      return
    }
    begin()
  })
}

function pickVoice(voices: SpeechSynthesisVoice[], language = 'en'): SpeechSynthesisVoice | undefined {
  const matching = voices.filter((voice) => voice.lang.toLowerCase().startsWith(language))
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
  return [...matching].sort((a, b) => score(b) - score(a))[0]
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
    // Stopping a sound on purpose fires error/abort too; that is not a reason to fall back.
    const failed = () => finish(stopped.has(audio))
    audio.onerror = failed
    audio.onended = () => finish(true)
    void audio.play().catch(failed)
  })
}

function stopAudio() {
  if (!currentAudio) return
  stopped.add(currentAudio)
  currentAudio.pause()
  currentAudio.src = ''
  currentAudio = null
}
