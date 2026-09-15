import { expect, it } from 'vitest'
import { suggestFixes } from './fixes'

it('offers dim and slow for a general flash, with the slow factor hitting 3/s', () => {
  const fixes = suggestFixes({ kind: 'general', start: 0.1, end: 5, peakPerSecond: 5 })
  expect(fixes.map((f) => f.label)).toEqual(['Dim range', 'Slow to 3 Hz'])
  expect(fixes[1].op).toMatchObject({ op: 'speed', start: 0.1, end: 5, factor: 0.6 })
})

it('offers desaturate for a red flash', () => {
  expect(suggestFixes({ kind: 'red', start: 0, end: 1, peakPerSecond: 4 }).map((f) => f.label)).toEqual(['Desaturate red'])
})
