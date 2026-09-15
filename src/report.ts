import type { FlashEvent } from './analysis/types'
import { suggestFixes } from './fixes'

/** Machine-readable report: verdict, every event, and the edit operations that would resolve each. */
export function buildReportJson(fileName: string, duration: number, events: FlashEvent[]) {
  return {
    file: fileName,
    durationSeconds: +duration.toFixed(3),
    generatedAt: new Date().toISOString(),
    standard: 'WCAG 2.3.1 Three Flashes or Below Threshold',
    verdict: events.length ? 'fail' : 'pass',
    issues: events.map((e) => ({ ...e, suggestedFixes: suggestFixes(e).map((f) => f.op) })),
  }
}

/** Saves a JSON file with the browser's native download. */
export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}
