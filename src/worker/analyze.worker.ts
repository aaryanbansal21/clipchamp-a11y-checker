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
  let lastProgress = -1

  const decoder = new VideoDecoder({
    output(frame) {
      const t = frame.timestamp / 1e6
      ctx.drawImage(frame, 0, 0, W, H)
      frame.close() // release the GPU-backed frame immediately
      const { lum, red } = toGrids(ctx.getImageData(0, 0, W, H).data, CELLS)
      for (const event of detector.push(t, lum, red)) post({ type: 'event', event })
      frames++
      if (t - lastProgress >= 0.1) {
        lastProgress = t
        post({ type: 'progress', t, duration })
      }
    },
    error(e) {
      errors.push(e)
    },
  })
  decoder.configure(config)

  // Decode (WebCodecs) with explicit back-pressure: the API has no push-back of its own.
  const sink = new EncodedPacketSink(track)
  for await (const packet of sink.packets()) {
    if (errors.length) throw errors[0]
    if (decoder.decodeQueueSize > MAX_QUEUE) {
      await new Promise<void>((resolve) => decoder.addEventListener('dequeue', () => resolve(), { once: true }))
    }
    decoder.decode(packet.toEncodedVideoChunk())
  }
  await decoder.flush()
  decoder.close()
  if (errors.length) throw errors[0]

  for (const event of detector.finish()) post({ type: 'event', event })
  post({ type: 'progress', t: duration, duration })
  post({ type: 'done', frames, ms: Math.round(performance.now() - t0) })
}
