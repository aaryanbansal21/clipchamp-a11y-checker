export type FlashEvent = {
  kind: 'general' | 'red'
  start: number // seconds
  end: number
  peakPerSecond: number
}

export type WorkerIn = { type: 'analyze'; file: File }

export type WorkerOut =
  | { type: 'progress'; t: number; duration: number }
  | { type: 'event'; event: FlashEvent }
  | { type: 'samples'; t: Float32Array; lum: Float32Array } // mean frame luminance, batched
  | { type: 'done'; frames: number; ms: number }
  | { type: 'error'; message: string }
