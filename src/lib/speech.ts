export async function playTerm(
  term: string,
  audioUrl?: string | null,
  options?: { rate?: number },
): Promise<void> {
  const rate = options?.rate ?? 1
  if (audioUrl && rate === 1) {
    try {
      const audio = new Audio(audioUrl)
      await audio.play()
      return
    } catch {
      // Dictionary audio can fail (blocked, 404, autoplay). Fall back to the browser voice.
    }
  }
  await speak(term, rate)
}

export function speak(term: string, rate = 1): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    if (!synth) {
      resolve()
      return
    }
    const utterance = new SpeechSynthesisUtterance(term)
    utterance.lang = 'en-US'
    utterance.rate = rate
    const voices = synth.getVoices()
    const voice =
      voices.find((item) => item.lang.toLowerCase().startsWith('en-gb')) ??
      voices.find((item) => item.lang.toLowerCase().startsWith('en'))
    if (voice) utterance.voice = voice
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    synth.cancel()
    synth.speak(utterance)
  })
}
