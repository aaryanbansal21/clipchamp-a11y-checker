import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from 'mediabunny'
import { FlashDetector } from '../analysis/flash'
import { toGrids } from '../analysis/luminance'
import type { WorkerIn, WorkerOut } from '../analysis/types'

const W = 64, H = 36, CELLS = W * H
const MAX_QUEUE = 8

const post = (m: WorkerOut) => postMessage(m)

self.onmessage = async ({ data }: MessageEvent<WorkerIn>) => {
  try {
    await analyze(data.file)
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

async function analyze(file: File) {
  const t0 = performance.now()

  // Demux (Mediabunny): container → decoder config + encoded packets in decode order.
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) })
  const track = await input.getPrimaryVideoTrack()
  if (!track) throw new Error('No video track found in this file.')
  const duration = await input.computeDuration()
  const config = await track.getDecoderConfig()
  if (!config) throw new Error('Could not read the codec configuration.')
  if (!(await VideoDecoder.isConfigSupported(config)).supported) {
    throw new Error(`Codec ${config.codec} is not supported by this browser's decoder.`)
  }

  // Analyse: each decoded frame → 64×36 grid → detector.
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const detector = new FlashDetector(CELLS)
  const errors: Error[] = []
  let frames = 0
  let lastProgress = 0 // wall-clock ms; progress posts at most ~10×/s regardless of decode speed
  const batchT: number[] = [], batchL: number[] = []
  const flushSamples = () => {
    if (!batchT.length) return
    post({ type: 'samples', t: Float32Array.from(batchT), lum: Float32Array.from(batchL) })
    batchT.length = batchL.length = 0
  }

  const decoder = new VideoDecoder({
    output(frame) {
      const t = frame.timestamp / 1e6
      ctx.drawImage(frame, 0, 0, W, H)
      frame.close() // release the GPU-backed frame immediately
      const { lum, red } = toGrids(ctx.getImageData(0, 0, W, H).data, CELLS)
      for (const event of detector.push(t, lum, red)) post({ type: 'event', event })
      frames++
      let sum = 0
      for (let i = 0; i < CELLS; i++) sum += lum[i]
      batchT.push(t); batchL.push(sum / CELLS)
      if (batchT.length >= 64) flushSamples()
      const now = performance.now()
      if (now - lastProgress >= 100) {
        lastProgress = now
        post({ type: 'progress', t, duration })
      }
    },
    error(e) {
      errors.push(e)
    },
  })
  decoder.configure(config)

  try {
    // Decode (WebCodecs) with explicit back-pressure: the API has no push-back of its own.
    const sink = new EncodedPacketSink(track)
    for await (const packet of sink.packets()) {
      if (decoder.decodeQueueSize > MAX_QUEUE) {
        await new Promise<void>((resolve) => decoder.addEventListener('dequeue', () => resolve(), { once: true }))
      }
      if (errors.length) throw errors[0] // checked after the wait so the real decoder error wins
      decoder.decode(packet.toEncodedVideoChunk())
    }
    await decoder.flush()
    if (errors.length) throw errors[0]
  } finally {
    if (decoder.state !== 'closed') decoder.close()
  }

  flushSamples()
  for (const event of detector.finish()) post({ type: 'event', event })
  post({ type: 'progress', t: duration, duration })
  post({ type: 'done', frames, ms: Math.round(performance.now() - t0) })
}
