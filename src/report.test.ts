import { expect, it } from 'vitest'
import { buildReport, buildReportJson } from './report'

it('lists each issue with its time range', () => {
  const r = buildReport('a.mp4', 5, [
    { start: 0.1, end: 5, color: '', title: 'General flash', detail: '5 flashes/s', event: { kind: 'general', start: 0.1, end: 5, peakPerSecond: 5 } },
  ])
  expect(r).toBe('Accessibility report: a.mp4 (5.0 s)\n1 issue\n0:00.1–0:05.0  General flash: 5 flashes/s')
})

it('says pass when there are no issues', () => {
  expect(buildReport('a.mp4', 5, [])).toContain('Pass')
})

it('json report carries the verdict and suggested fix ops', () => {
  const r = buildReportJson('a.mp4', 5, [{ kind: 'general', start: 0.1, end: 5, peakPerSecond: 5 }])
  expect(r.verdict).toBe('fail')
  expect(r.issues[0].suggestedFixes.map((f) => f.op)).toEqual(['colorAdjust', 'speed'])
  expect(buildReportJson('a.mp4', 5, []).verdict).toBe('pass')
})
