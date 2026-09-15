import { expect, it } from 'vitest'
import { buildReportJson } from './report'

it('json report carries the verdict and suggested fix ops', () => {
  const r = buildReportJson('a.mp4', 5, [{ kind: 'general', start: 0.1, end: 5, peakPerSecond: 5 }])
  expect(r.verdict).toBe('fail')
  expect(r.issues[0].suggestedFixes.map((f) => f.op)).toEqual(['colorAdjust', 'speed'])
  expect(buildReportJson('a.mp4', 5, []).verdict).toBe('pass')
})
