import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { checkCaptions, parseCaptions } from './analysis/captions'
import type { CaptionEvent, FlashEvent, WorkerOut } from './analysis/types'
import { IssueList, type Issue } from './ui/IssueList'
import { Timeline } from './ui/Timeline'

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; t: number; duration: number }
  | { kind: 'done'; frames: number; ms: number }
  | { kind: 'error'; message: string }

const COLOR = { general: '#ff5c5c', red: '#c02020', caption: '#4cc2ff' }

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [flashes, setFlashes] = useState<FlashEvent[]>([])
  const [captions, setCaptions] = useState<CaptionEvent[]>([])
  const [captionNote, setCaptionNote] = useState('')
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [over, setOver] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const url = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  // One worker per file; terminated when it finishes, on unmount, or when a new file is dropped.
  useEffect(() => {
    if (!file) return
    setFlashes([])
    setDuration(0)
    setCurrent(0)
    setStatus({ kind: 'running', t: 0, duration: 0 })
    const worker = new Worker(new URL('./worker/analyze.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<WorkerOut>) => {
      if (data.type === 'progress') {
        setStatus({ kind: 'running', t: data.t, duration: data.duration })
        setDuration((d) => d || data.duration) // fallback if <video> can't report metadata
      } else if (data.type === 'event') setFlashes((f) => [...f, data.event])
      else if (data.type === 'done') { setStatus({ kind: 'done', frames: data.frames, ms: data.ms }); worker.terminate() }
      else { setStatus({ kind: 'error', message: data.message }); worker.terminate() }
    }
    worker.postMessage({ type: 'analyze', file })
    return () => worker.terminate()
  }, [file])

  async function addFiles(list: FileList | null) {
    for (const f of Array.from(list ?? [])) {
      if (/\.(srt|vtt)$/i.test(f.name)) {
        const cues = parseCaptions(await f.text())
        setCaptions(checkCaptions(cues))
        setCaptionNote(cues.length ? `${cues.length} cues from ${f.name}` : `No cues found in ${f.name}`)
      } else {
        setFile(f)
      }
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    addFiles(e.dataTransfer.files)
  }

  function seek(t: number) {
    const v = videoRef.current
    if (v) { v.currentTime = t; v.pause(); setCurrent(t) }
  }

  const issues: Issue[] = [
    ...flashes.map((f): Issue => ({
      tier: 'Compliance', start: f.start, end: f.end, color: COLOR[f.kind],
      title: f.kind === 'red' ? 'Red flash' : 'General flash',
      detail: `${f.peakPerSecond} flashes/s — WCAG 2.3.1 allows 3`,
    })),
    ...captions.map((c): Issue => ({
      tier: 'Readability', start: c.start, end: c.end, color: COLOR.caption,
      title: c.kind === 'fast' ? 'Caption too fast' : 'Caption too brief',
      detail: c.kind === 'fast'
        ? `${c.cps.toFixed(0)} chars/s — guideline is 20`
        : `${(c.end - c.start).toFixed(2)} s on screen — guideline is 0.83 s`,
    })),
  ].sort((a, b) => a.start - b.start)

  const toMark = (i: Issue) => ({ start: i.start, end: i.end, color: i.color, label: `${i.title} at ${i.start.toFixed(1)}s` })
  const lanes = [
    { name: 'Compliance', marks: issues.filter((i) => i.tier === 'Compliance').map(toMark) },
    { name: 'Readability', marks: issues.filter((i) => i.tier === 'Readability').map(toMark) },
  ]

  if (typeof VideoDecoder === 'undefined') {
    return (
      <div className="app">
        <header className="topbar"><span className="brand">Accessibility Checker</span></header>
        <p className="empty">This tool needs WebCodecs. Please open it in Chrome, Edge or Safari 16.4+.</p>
      </div>
    )
  }

  return (
    <div
      className={`app${over ? ' over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false) }}
      onDrop={onDrop}
    >
      <header className="topbar">
        <span className="brand">Accessibility Checker</span>
        <span className="hint">Runs in your browser · nothing is uploaded</span>
        <label className="btn primary">
          Import media
          <input type="file" multiple hidden accept="video/*,.srt,.vtt" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        </label>
      </header>

      <section className="stage">
        {file ? (
          <video
            ref={videoRef}
            src={url}
            controls
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          />
        ) : (
          <div className="empty">
            <div className="empty-icon">⬆</div>
            Drop a video (MP4 / WebM) here, plus an optional caption file (.srt / .vtt)
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          {status.kind === 'running' && (
            <>
              <span className="spinner" />
              <span>Scanning {status.t.toFixed(1)} / {status.duration.toFixed(1)} s</span>
              <progress value={status.t} max={status.duration || 1} />
            </>
          )}
          {status.kind === 'done' && (
            <>
              <span className={`badge ${issues.length ? 'fail' : 'pass'}`}>
                {issues.length
                  ? `${flashes.length} compliance issue${flashes.length === 1 ? '' : 's'} · ${captions.length} readability note${captions.length === 1 ? '' : 's'}`
                  : 'Pass'}
              </span>
              <span className="muted">{status.frames} frames in {(status.ms / 1000).toFixed(1)} s · {Math.round(status.frames / (status.ms / 1000))} fps</span>
            </>
          )}
          {status.kind === 'error' && <span className="error">{status.message}</span>}
          {status.kind === 'idle' && <span className="muted">Timeline</span>}
          <span className="legend">
            <i style={{ background: COLOR.general }} /> General flash
            <i style={{ background: COLOR.red }} /> Red flash
            <i style={{ background: COLOR.caption }} /> Caption
          </span>
        </div>
        {captionNote && <p className="muted small">{captionNote}</p>}
        <Timeline duration={duration} lanes={lanes} current={current} onSeek={seek} />
      </section>

      {issues.length > 0 && (
        <section className="panel">
          <div className="panel-head"><span>Issues</span></div>
          <IssueList issues={issues} onSeek={seek} />
        </section>
      )}

      <footer>
        <h2>How it works</h2>
        <pre>{`file → Mediabunny demux → VideoDecoder (WebCodecs, in a Worker, with back-pressure)
     → 64×36 luminance grid → WCAG 2.3.1 flash counter → timeline`}</pre>
        <p>
          <strong>Compliance</strong> checks implement WCAG 2.3.1 (Three Flashes or Below Threshold), the clause EN 301 549 points to
          for the European Accessibility Act (in force since 28 June 2025). Flashing content can trigger seizures in up to 1 in 4,000 people.
        </p>
        <p>
          <strong>Readability</strong> checks follow Netflix/BBC subtitle guidelines (20 characters/second, 5/6 s minimum). About 75% of mobile video is watched on mute.
        </p>
        <p>This is a compliance aid, not a certification. Nothing leaves your device.</p>
      </footer>
    </div>
  )
}
