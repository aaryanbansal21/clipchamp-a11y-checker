import { expect, it } from 'vitest'
import { buildReport } from './report'

it('lists each issue with its time range', () => {
  const r = buildReport('a.mp4', 5, [
    { tier: 'Compliance', start: 0.1, end: 5, color: '', title: 'General flash', detail: '5 flashes/s' },
  ])
  expect(r).toBe('Accessibility report: a.mp4 (5.0 s)\n1 issue\n0:00.1–0:05.0  Compliance  General flash: 5 flashes/s')
})

it('says pass when there are no issues', () => {
  expect(buildReport('a.mp4', 5, [])).toContain('Pass')
})
