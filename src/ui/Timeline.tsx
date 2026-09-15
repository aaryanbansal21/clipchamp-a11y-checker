export type Mark = { start: number; end: number; color: string; label: string }
export type Lane = { name: string; marks: Mark[] }
export type Trace = { t: number[]; lum: number[] }

const MAX_POINTS = 2000

/** SVG points for the luminance trace, x in seconds and y in [0, 1] (1 = black), downsampled by stride. */
export function tracePoints(trace: Trace, max = MAX_POINTS): string {
  const stride = Math.max(1, Math.ceil(trace.t.length / max))
  const out: string[] = []
  for (let i = 0; i < trace.t.length; i += stride) out.push(`${trace.t[i]},${1 - trace.lum[i]}`)
  return out.join(' ')
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Tick spacing so the ruler has roughly 6–12 labels. */
const step = (d: number) => [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => d / s <= 12) ?? 600

export function Timeline({
  duration,
  lanes,
  trace,
  current,
  onSeek,
}: {
  duration: number
  lanes: Lane[]
  trace: Trace
  current: number
  onSeek: (t: number) => void
}) {
  if (!duration) return null
  const pct = (t: number) => `${(t / duration) * 100}%`
  const ticks: number[] = []
  for (let t = 0; t <= duration; t += step(duration)) ticks.push(t)

  return (
    <div className="tl">
      <div className="tl-names">
        <div className="tl-ruler-spacer" />
        <div className="tl-name">Luminance</div>
        {lanes.map((l) => (
          <div key={l.name} className="tl-name">{l.name}</div>
        ))}
      </div>
      <div
        className="tl-tracks"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onSeek(((e.clientX - r.left) / r.width) * duration)
        }}
      >
        <div className="tl-ruler">
          {ticks.map((t) => (
            <span key={t} className="tl-tick" style={{ left: pct(t) }}>{fmt(t)}</span>
          ))}
        </div>
        <div className="tl-lane tl-trace">
          <svg viewBox={`0 0 ${duration} 1`} preserveAspectRatio="none">
            <polyline points={tracePoints(trace)} vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        {lanes.map((l) => (
          <div key={l.name} className="tl-lane">
            {l.marks.map((m, i) => (
              <button
                key={i}
                className="tl-mark"
                title={m.label}
                aria-label={m.label}
                style={{ left: pct(m.start), width: `max(4px, ${((m.end - m.start) / duration) * 100}%)`, background: m.color }}
                onClick={(e) => {
                  e.stopPropagation()
                  onSeek(m.start)
                }}
              />
            ))}
          </div>
        ))}
        <div className="tl-playhead" style={{ left: pct(Math.min(current, duration)) }} />
      </div>
    </div>
  )
}
