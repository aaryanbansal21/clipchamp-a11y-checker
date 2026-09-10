export type Issue = {
  tier: 'Compliance' | 'Readability'
  start: number
  end: number
  color: string
  title: string
  detail: string
}

export const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

export function IssueList({ issues, onSeek }: { issues: Issue[]; onSeek: (t: number) => void }) {
  if (!issues.length) return null
  return (
    <ul className="issues">
      {issues.map((i, k) => (
        <li key={k}>
          <button onClick={() => onSeek(i.start)}>
            <span className="dot" style={{ background: i.color }} />
            <time>{fmt(i.start)}–{fmt(i.end)}</time>
            <strong>{i.title}</strong>
            <span>{i.detail}</span>
            <em>{i.tier}</em>
          </button>
        </li>
      ))}
    </ul>
  )
}
