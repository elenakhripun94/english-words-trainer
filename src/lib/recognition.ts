export function isRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function listen(): Promise<string[]> {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Ctor) return Promise.reject(new Error('unsupported'))

  return new Promise((resolve, reject) => {
    const recognition = new Ctor()
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 5
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const result = event.results[0]
      const alternatives: string[] = []
      if (result) {
        for (let i = 0; i < result.length; i++) {
          const transcript = result[i]?.transcript
          if (transcript) alternatives.push(transcript)
        }
      }
      finish(() => resolve(alternatives))
    }
    recognition.onerror = (event) => finish(() => reject(new Error(event.error || 'recognition_error')))
    recognition.onend = () => finish(() => resolve([]))
    try {
      recognition.start()
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error('recognition_error')))
    }
  })
}
