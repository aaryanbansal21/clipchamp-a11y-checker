export type Mark = { start: number; end: number; color: string; label: string }

export function Timeline({ duration, marks, onSeek }: { duration: number; marks: Mark[]; onSeek: (t: number) => void }) {
  if (!duration) return null
  return (
    <div
      className="timeline"
      role="group"
      aria-label="Issue timeline"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onSeek(((e.clientX - r.left) / r.width) * duration)
      }}
    >
      {marks.map((m, i) => (
        <button
          key={i}
          className="mark"
          title={m.label}
          aria-label={m.label}
          style={{
            left: `${(m.start / duration) * 100}%`,
            width: `${Math.max(0.5, ((m.end - m.start) / duration) * 100)}%`,
            background: m.color,
          }}
          onClick={(e) => {
            e.stopPropagation()
            onSeek(m.start)
          }}
        />
      ))}
    </div>
  )
}
