import { describe, expect, it } from 'vitest'
import { FlashDetector } from './flash'
import type { FlashEvent } from './types'

const CELLS = 100
const FPS = 30

/** Feed `seconds` of frames. `lumAt`/`redAt` return the value for cell i at frame f. */
function run(
  det: FlashDetector,
  seconds: number,
  lumAt: (f: number, i: number) => number,
  redAt: (f: number, i: number) => 0 | 1 = () => 0,
  startFrame = 0,
): FlashEvent[] {
  const out: FlashEvent[] = []
  for (let f = startFrame; f < startFrame + seconds * FPS; f++) {
    const lum = new Float32Array(CELLS)
    const red = new Uint8Array(CELLS)
    for (let i = 0; i < CELLS; i++) {
      lum[i] = lumAt(f, i)
      red[i] = redAt(f, i)
    }
    out.push(...det.push(f / FPS, lum, red))
  }
  return out
}

/** Square wave: `hz` flashes/second, alternating lo/hi. */
const square = (hz: number, lo: number, hi: number) => (f: number) =>
  Math.floor((f / FPS) * hz * 2) % 2 === 0 ? lo : hi

describe('FlashDetector', () => {
  it('flags a 5 Hz full-frame flash as a general violation', () => {
    const det = new FlashDetector(CELLS)
    const events = [...run(det, 3, square(5, 0.1, 0.9)), ...det.finish()]
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('general')
    expect(events[0].peakPerSecond).toBe(5)
    expect(events[0].start).toBeCloseTo(0.1, 1)
    expect(events[0].end).toBeCloseTo(3, 0)
  })

  it('does not flag 2 Hz', () => {
    const det = new FlashDetector(CELLS)
    expect([...run(det, 3, square(2, 0.1, 0.9)), ...det.finish()]).toHaveLength(0)
  })

  it('does not flag 5 Hz on only 10% of the frame', () => {
    const det = new FlashDetector(CELLS)
    const wave = square(5, 0.1, 0.9)
    expect([...run(det, 3, (f, i) => (i < 10 ? wave(f) : 0.5)), ...det.finish()]).toHaveLength(0)
  })

  it('does not flag swings below 0.1', () => {
    const det = new FlashDetector(CELLS)
    expect([...run(det, 3, square(5, 0.5, 0.58)), ...det.finish()]).toHaveLength(0)
  })

  it('flags red on/off at 5 Hz as a red violation only', () => {
    const det = new FlashDetector(CELLS)
    const wave = square(5, 0, 1)
    const events = [...run(det, 3, () => 0.3, (f) => (wave(f) ? 1 : 0)), ...det.finish()]
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('red')
  })

  it('merges two bursts 0.5 s apart into one event', () => {
    const det = new FlashDetector(CELLS)
    const wave = square(5, 0.1, 0.9)
    const events = [
      ...run(det, 1, wave),                              // burst A: 0–1 s
      ...run(det, 0.5, () => 0.9, () => 0, 30),          // steady: 1–1.5 s
      ...run(det, 1, wave, () => 0, 45),                 // burst B: 1.5–2.5 s
      ...det.finish(),
    ]
    expect(events).toHaveLength(1)
    expect(events[0].start).toBeCloseTo(0.1, 1)
    expect(events[0].end).toBeCloseTo(2.4, 1) // last transition of burst B is at frame 72
  })
})
