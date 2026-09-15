import { expect, it } from 'vitest'
import { tracePoints } from './Timeline'

it('maps time to x and inverted luminance to y', () => {
  expect(tracePoints({ t: [0, 1], lum: [1, 0.25] })).toBe('0,0 1,0.75')
})

it('downsamples to at most max points', () => {
  const n = 10
  const t = Array.from({ length: n }, (_, i) => i)
  expect(tracePoints({ t, lum: t.map(() => 0) }, 4).split(' ')).toHaveLength(4)
})
