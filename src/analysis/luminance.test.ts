import { describe, expect, it } from 'vitest'
import { toGrids } from './luminance'

const px = (...rgb: number[][]) => {
  const data = new Uint8ClampedArray(rgb.length * 4)
  rgb.forEach(([r, g, b], i) => data.set([r, g, b, 255], i * 4))
  return data
}

describe('toGrids', () => {
  it('white is luminance 1, black is 0', () => {
    const { lum, red } = toGrids(px([255, 255, 255], [0, 0, 0]), 2)
    expect(lum[0]).toBeCloseTo(1, 3)
    expect(lum[1]).toBeCloseTo(0, 3)
    expect(Array.from(red)).toEqual([0, 0])
  })

  it('pure red is saturated red with luminance 0.2126', () => {
    const { lum, red } = toGrids(px([255, 0, 0]), 1)
    expect(lum[0]).toBeCloseTo(0.2126, 3)
    expect(red[0]).toBe(1)
  })

  it('orange is not saturated red', () => {
    const { red } = toGrids(px([255, 120, 0]), 1)
    expect(red[0]).toBe(0)
  })
})
