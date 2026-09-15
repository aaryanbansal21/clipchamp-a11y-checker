import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { FlashEvent, WorkerOut } from './analysis/types'
import { IssueList, type Issue } from './ui/IssueList'
import { Timeline, type Trace } from './ui/Timeline'
import { buildReport, buildReportJson, downloadJson } from './report'

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; t: number; duration: number }
  | { kind: 'done'; frames: number; ms: number }
  | { kind: 'error'; message: string }

const COLOR = { general: '#ff5c5c', red: '#c02020' }

const SAMPLES = [
  ['flash-5hz.mp4', '5 Hz flash'],
  ['red-5hz.mp4', 'Red flash'],
  ['burst-in-calm.mp4', '1 s burst in 20 s'],
  ['steady.mp4', 'Steady (pass)'],
]

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [flashes, setFlashes] = useState<FlashEvent[]>([])
  const [trace, setTrace] = useState<Trace>({ t: [], lum: [] })
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [over, setOver] = useState(false)
  const [copied, setCopied] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const url = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  // One worker per file; terminated when it finishes, on unmount, or when a new file is dropped.
  useEffect(() => {
    if (!file) return
    setFlashes([])
    setTrace({ t: [], lum: [] })
    setDuration(0)
    setCurrent(0)
    setStatus({ kind: 'running', t: 0, duration: 0 })
    const worker = new Worker(new URL('./worker/analyze.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<WorkerOut>) => {
      if (data.type === 'progress') {
        setStatus({ kind: 'running', t: data.t, duration: data.duration })
        setDuration((d) => d || data.duration) // fallback if <video> can't report metadata
      } else if (data.type === 'event') setFlashes((f) => [...f, data.event])
      else if (data.type === 'samples') setTrace((p) => ({ t: [...p.t, ...data.t], lum: [...p.lum, ...data.lum] }))
      else if (data.type === 'done') { setStatus({ kind: 'done', frames: data.frames, ms: data.ms }); worker.terminate() }
      else { setStatus({ kind: 'error', message: data.message }); worker.terminate() }
    }
    worker.postMessage({ type: 'analyze', file })
    return () => worker.terminate()
  }, [file])

  function addFiles(list: FileList | null) {
    const f = list?.[0]
    if (f) setFile(f)
  }

  async function loadSample(name: string) {
    const blob = await (await fetch(`/samples/${name}`)).blob()
    setFile(new File([blob], name, { type: 'video/mp4' }))
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

  const issues: Issue[] = flashes.map((f): Issue => ({
    start: f.start, end: f.end, color: COLOR[f.kind], event: f,
    title: f.kind === 'red' ? 'Red flash' : 'General flash',
    detail: `${f.peakPerSecond} flashes/s — WCAG 2.3.1 allows 3`,
  })).sort((a, b) => a.start - b.start)

  async function copyReport() {
    await navigator.clipboard.writeText(buildReport(file?.name ?? '', duration, issues))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const toMark = (i: Issue) => ({ start: i.start, end: i.end, color: i.color, label: `${i.title} at ${i.start.toFixed(1)}s` })
  const lanes = [{ name: 'Flashes', marks: issues.map(toMark) }]

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
          <input type="file" hidden accept="video/*" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
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
            Drop a video (MP4 / WebM) here
            <div className="samples">
              <span className="muted small">or try a sample:</span>
              {SAMPLES.map(([name, label]) => (
                <button key={name} className="btn" onClick={() => loadSample(name)}>{label}</button>
              ))}
            </div>
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
                {issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}` : 'Pass'}
              </span>
              <span className="muted">{status.frames} frames in {(status.ms / 1000).toFixed(1)} s · {Math.round(status.frames / (status.ms / 1000))} fps</span>
              <button className="btn small" onClick={copyReport}>{copied ? 'Copied' : 'Copy report'}</button>
              <button className="btn small" onClick={() => downloadJson(`${file?.name ?? 'video'}.a11y.json`, buildReportJson(file?.name ?? '', duration, flashes))}>Download report</button>
            </>
          )}
          {status.kind === 'error' && <span className="error">{status.message}</span>}
          {status.kind === 'idle' && <span className="muted">Timeline</span>}
          <span className="legend">
            <i style={{ background: COLOR.general }} /> General flash
            <i style={{ background: COLOR.red }} /> Red flash
            <i style={{ background: 'var(--trace)' }} /> Mean luminance
          </span>
        </div>
        <Timeline duration={duration} lanes={lanes} trace={trace} current={current} onSeek={seek} />
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
          <strong>Flash</strong> checks implement WCAG 2.3.1 (Three Flashes or Below Threshold), the clause EN 301 549 points to
          for the European Accessibility Act (in force since 28 June 2025). Flashing content can trigger seizures in up to 1 in 4,000 people.
        </p>
        <p>
          <strong>Fixes</strong> are expressed as edit operations for the editor to apply, so they go through the same undo stack and renderer as any other edit.
          The <strong>report</strong> is a JSON file with the verdict, every event, and its suggested fixes.
        </p>
        <p>This is a compliance aid, not a certification. Nothing leaves your device.</p>
      </footer>
    </div>
  )
}
