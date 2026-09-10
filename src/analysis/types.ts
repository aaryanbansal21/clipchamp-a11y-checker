export type FlashEvent = {
  kind: 'general' | 'red'
  start: number // seconds
  end: number
  peakPerSecond: number
}

export type Cue = { start: number; end: number; text: string }

export type CaptionEvent = {
  kind: 'fast' | 'brief'
  start: number
  end: number
  cps: number
  text: string
}

export type WorkerIn = { type: 'analyze'; file: File }

export type WorkerOut =
  | { type: 'progress'; t: number; duration: number }
  | { type: 'event'; event: FlashEvent }
  | { type: 'done'; frames: number; ms: number }
  | { type: 'error'; message: string }
