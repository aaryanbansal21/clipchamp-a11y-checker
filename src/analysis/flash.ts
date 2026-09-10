import type { FlashEvent } from './types'

export type Thresholds = {
  deltaLum: number          // min luminance swing from the last turning point
  darkBelow: number         // darker side of the swing must be below this
  areaFraction: number      // fraction of cells that must transition together
  maxFlashesPerSecond: number
}

/** WCAG 2.3.1 defaults. */
export const WCAG: Thresholds = { deltaLum: 0.1, darkBelow: 0.8, areaFraction: 0.25, maxFlashesPerSecond: 3 }

type Transition = { t: number; dir: 1 | -1 }

/** One channel (general or red): turns frame-level transitions into violation events. */
class Channel {
  private transitions: Transition[] = []
  private open: FlashEvent | null = null

  constructor(private kind: FlashEvent['kind'], private th: Thresholds) {}

  /** Close the open event once no violation has extended it for 2 s (1 s merge gap + 1 s window). */
  tick(t: number): FlashEvent | null {
    if (this.open && t > this.open.end + 2) {
      const e = this.open
      this.open = null
      return e
    }
    return null
  }

  transition(t: number, dir: 1 | -1): FlashEvent | null {
    const last = this.transitions.at(-1)
    if (last?.dir === dir) return null // same direction twice counts once
    this.transitions.push({ t, dir })
    while (this.transitions[0].t < t - 1) this.transitions.shift() // keep the (t−1, t] window
    const flashes = Math.floor(this.transitions.length / 2)
    if (flashes <= this.th.maxFlashesPerSecond) return null

    const start = this.transitions[0].t
    if (this.open && start <= this.open.end + 1) {
      this.open.end = t
      this.open.peakPerSecond = Math.max(this.open.peakPerSecond, flashes)
      return null
    }
    const closed = this.open
    this.open = { kind: this.kind, start, end: t, peakPerSecond: flashes }
    return closed
  }

  finish(): FlashEvent | null {
    const e = this.open
    this.open = null
    return e
  }
}

/**
 * Streaming WCAG 2.3.1 detector. Feed one frame at a time; events are returned once complete.
 *
 * ponytail: area is measured against the whole frame rather than WCAG's 341×256 px viewport
 * window. Upgrade path: larger grid + sliding window over it.
 */
export class FlashDetector {
  private th: Thresholds
  private turn: Float32Array   // luminance at last turning point per cell
  private dir: Int8Array       // current direction per cell: 1, -1, 0 (unknown)
  private redPrev: Uint8Array
  private first = true
  private general: Channel
  private red: Channel

  constructor(private cells: number, th: Partial<Thresholds> = {}) {
    this.th = { ...WCAG, ...th }
    this.turn = new Float32Array(cells)
    this.dir = new Int8Array(cells)
    this.redPrev = new Uint8Array(cells)
    this.general = new Channel('general', this.th)
    this.red = new Channel('red', this.th)
  }

  push(t: number, lum: Float32Array, red: Uint8Array): FlashEvent[] {
    const out: FlashEvent[] = []
    const add = (e: FlashEvent | null) => e && out.push(e)
    add(this.general.tick(t))
    add(this.red.tick(t))

    if (this.first) {
      this.turn.set(lum)
      this.redPrev.set(red)
      this.first = false
      return out
    }

    let up = 0, down = 0, redOn = 0, redOff = 0
    for (let i = 0; i < this.cells; i++) {
      const v = lum[i], p = this.turn[i], d = this.dir[i]
      if ((d > 0 && v > p) || (d < 0 && v < p)) {
        this.turn[i] = v // still moving the same way: track the extremum
      } else {
        const delta = v - p
        if (Math.abs(delta) >= this.th.deltaLum && Math.min(v, p) < this.th.darkBelow) {
          const nd = delta > 0 ? 1 : -1
          this.dir[i] = nd
          this.turn[i] = v
          if (nd > 0) up++; else down++
        }
      }
      if (red[i] !== this.redPrev[i]) {
        if (red[i]) redOn++; else redOff++
      }
    }
    this.redPrev.set(red)

    const need = this.th.areaFraction * this.cells
    if (up >= need) add(this.general.transition(t, 1))
    if (down >= need) add(this.general.transition(t, -1))
    if (redOn >= need) add(this.red.transition(t, 1))
    if (redOff >= need) add(this.red.transition(t, -1))
    return out
  }

  finish(): FlashEvent[] {
    return [this.general.finish(), this.red.finish()].filter((e): e is FlashEvent => e !== null)
  }
}
