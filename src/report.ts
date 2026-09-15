import { fmt, type Issue } from './ui/IssueList'

/** Plain-text summary for the clipboard. */
export function buildReport(fileName: string, duration: number, issues: Issue[]): string {
  const head = `Accessibility report: ${fileName} (${duration.toFixed(1)} s)`
  const verdict = issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}` : 'Pass: no issues found'
  const lines = issues.map((i) => `${fmt(i.start)}–${fmt(i.end)}  ${i.tier}  ${i.title}: ${i.detail}`)
  return [head, verdict, ...lines].join('\n')
}
