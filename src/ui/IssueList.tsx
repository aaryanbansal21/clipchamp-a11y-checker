import { useState } from 'react'
import type { FlashEvent } from '../analysis/types'
import { suggestFixes, type Fix } from '../fixes'

export type Issue = {
  start: number
  end: number
  color: string
  title: string
  detail: string
  event: FlashEvent
}

export const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

export function IssueList({ issues, onSeek }: { issues: Issue[]; onSeek: (t: number) => void }) {
  const [open, setOpen] = useState<{ issue: number; fix: number } | null>(null)
  if (!issues.length) return null
  return (
    <ul className="issues">
      {issues.map((i, k) => {
        const fixes = suggestFixes(i.event)
        const shown: Fix | undefined = open?.issue === k ? fixes[open.fix] : undefined
        return (
          <li key={k}>
            <div className="issue-row">
              <button className="issue-main" onClick={() => onSeek(i.start)}>
                <span className="dot" style={{ background: i.color }} />
                <time>{fmt(i.start)} – {fmt(i.end)}</time>
                <strong>{i.title}</strong>
                <span className="detail">{i.detail}</span>
              </button>
              <span className="fixes">
                {fixes.map((f, j) => (
                  <button
                    key={f.label}
                    className={`btn small${shown === f ? ' active' : ''}`}
                    onClick={() => setOpen(shown === f ? null : { issue: k, fix: j })}
                  >
                    {f.label}
                  </button>
                ))}
              </span>
            </div>
            {shown && (
              <div className="fix-detail">
                <p>{shown.how}</p>
                <pre>{JSON.stringify(shown.op)}</pre>
                <p className="muted small">Edit operation the checker hands to the editor. Applying it is the editor's job, so it uses the same undo stack and rendering as any other edit.</p>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
