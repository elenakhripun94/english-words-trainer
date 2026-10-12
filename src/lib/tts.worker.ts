/// <reference lib="webworker" />
// Kokoro runs here so the editor does not freeze while a word is being voiced.
import { KokoroTTS } from 'kokoro-js'

export type TtsRequest = { id: number; text: string; voice: string }
export type TtsMessage =
  /** Hugging Face often sends the model without its size, so total is the expected size of the files. */
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  /** The GPU did not work; the model is loaded again for the CPU. */
  | { type: 'fallback'; reason: string }
  | { type: 'done'; id: number; samples: Float32Array; rate: number }
  | { type: 'error'; id: number; message: string }

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
// On the GPU a word takes a fraction of a second; on the CPU in one thread it takes several seconds.
const SETUPS = {
  webgpu: { device: 'webgpu', dtype: 'fp32', bytes: 326_000_000 },
  wasm: { device: 'wasm', dtype: 'q8', bytes: 92_500_000 },
} as const
type Setup = (typeof SETUPS)[keyof typeof SETUPS]
const files = new Map<string, number>()
let model: Promise<KokoroTTS> | null = null

async function pickSetup() {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
  try {
    if (gpu && (await gpu.requestAdapter())) return SETUPS.webgpu
  } catch {
    // No usable GPU.
  }
  return SETUPS.wasm
}

function post(message: TtsMessage, transfer: Transferable[] = []) {
  self.postMessage(message, transfer)
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** Some GPUs and browsers (Safari) fail on the first run or return silence instead of an error. */
function audible(samples: Float32Array) {
  let peak = 0
  for (const sample of samples) {
    if (Number.isNaN(sample)) return false
    peak = Math.max(peak, Math.abs(sample))
  }
  return peak > 0.01
}

async function loadWith(setup: Setup) {
  files.clear()
  const tts = await KokoroTTS.from_pretrained(MODEL, {
    dtype: setup.dtype,
    device: setup.device,
    progress_callback: (event: { status: string; file?: string; loaded?: number }) => {
      if (event.status !== 'progress' || !event.file) return
      files.set(event.file, event.loaded ?? 0)
      const loaded = [...files.values()].reduce((sum, bytes) => sum + bytes, 0)
      post({ type: 'progress', loaded, total: Math.max(setup.bytes, loaded) })
    },
  })
  // A test word proves the setup really works before real words are voiced.
  const check = await tts.generate('hello', { voice: 'af_heart' })
  if (!audible(check.audio as Float32Array)) throw new Error('silent_output')
  return tts
}

function load() {
  model ??= (async () => {
    const setup = await pickSetup()
    try {
      const tts = await loadWith(setup)
      post({ type: 'ready', device: setup.device })
      return tts
    } catch (error) {
      if (setup === SETUPS.wasm) throw error
      post({ type: 'fallback', reason: messageOf(error) })
      const tts = await loadWith(SETUPS.wasm)
      post({ type: 'ready', device: 'wasm' })
      return tts
    }
  })()
  model.catch(() => {
    model = null
  })
  return model
}

// Requests are handled one by one: the main thread waits for each answer before sending the next.
self.onmessage = async (event: MessageEvent<TtsRequest>) => {
  const { id, text, voice } = event.data
  try {
    const tts = await load()
    const audio = await tts.generate(text, { voice: voice as never })
    const samples = audio.audio as Float32Array
    post({ type: 'done', id, samples, rate: audio.sampling_rate }, [samples.buffer])
  } catch (error) {
    post({ type: 'error', id, message: messageOf(error) })
  }
}
