import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { checkCaptions, parseCaptions } from './analysis/captions'
import type { CaptionEvent, FlashEvent, WorkerOut } from './analysis/types'
import { IssueList, type Issue } from './ui/IssueList'
import { Timeline } from './ui/Timeline'

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; t: number; duration: number }
  | { kind: 'done'; frames: number; ms: number }
  | { kind: 'error'; message: string }

const COLOR = { general: '#d13438', red: '#7a1f1f', caption: '#0078d4' }

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [flashes, setFlashes] = useState<FlashEvent[]>([])
  const [captions, setCaptions] = useState<CaptionEvent[]>([])
  const [captionNote, setCaptionNote] = useState('')
  const [duration, setDuration] = useState(0)
  const [over, setOver] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const url = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  // One worker per file; terminated on unmount or when a new file is dropped.
  useEffect(() => {
    if (!file) return
    setFlashes([])
    setStatus({ kind: 'running', t: 0, duration: 0 })
    const worker = new Worker(new URL('./worker/analyze.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<WorkerOut>) => {
      if (data.type === 'progress') setStatus({ kind: 'running', t: data.t, duration: data.duration })
      else if (data.type === 'event') setFlashes((f) => [...f, data.event])
      else if (data.type === 'done') setStatus({ kind: 'done', frames: data.frames, ms: data.ms })
      else setStatus({ kind: 'error', message: data.message })
    }
    worker.postMessage({ type: 'analyze', file })
    return () => worker.terminate()
  }, [file])

  async function addFiles(list: FileList | null) {
    for (const f of Array.from(list ?? [])) {
      if (/\.(srt|vtt)$/i.test(f.name)) {
        const cues = parseCaptions(await f.text())
        if (!cues.length) { setCaptionNote(`No cues found in ${f.name}`); continue }
        setCaptionNote(`${cues.length} cues from ${f.name}`)
        setCaptions(checkCaptions(cues))
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
    if (v) { v.currentTime = t; v.pause() }
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

  if (typeof VideoDecoder === 'undefined') {
    return <main><h1>Video Accessibility Checker</h1><p>This tool needs WebCodecs. Please open it in Chrome, Edge or Safari 16.4+.</p></main>
  }

  return (
    <main>
      <h1>Video Accessibility Checker</h1>
      <p className="legend">
        <span style={{ '--c': COLOR.general } as CSSProperties}>General flash</span>
        <span style={{ '--c': COLOR.red } as CSSProperties}>Red flash</span>
        <span style={{ '--c': COLOR.caption } as CSSProperties}>Caption readability</span>
      </p>

      <label
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        Drop a video (MP4/WebM) and optionally a caption file (.srt/.vtt), or click to browse.
        <br />Nothing is uploaded — analysis runs in your browser.
        <input type="file" multiple hidden accept="video/*,.srt,.vtt" onChange={(e) => addFiles(e.target.files)} />
      </label>
      {captionNote && <p className="note">{captionNote}</p>}

      {file && (
        <>
          <video ref={videoRef} src={url} controls onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} />
          {status.kind === 'running' && (
            <>
              <progress value={status.t} max={status.duration || 1} />
              <p className="stats">Scanning… {status.t.toFixed(1)} / {status.duration.toFixed(1)} s</p>
            </>
          )}
          {status.kind === 'done' && (
            <p className="stats">{status.frames} frames in {(status.ms / 1000).toFixed(1)} s ({Math.round(status.frames / (status.ms / 1000))} fps)</p>
          )}
          {status.kind === 'error' && <p className="note">{status.message}</p>}

          <Timeline duration={duration} marks={issues.map((i) => ({ start: i.start, end: i.end, color: i.color, label: `${i.title} at ${i.start.toFixed(1)}s` }))} onSeek={seek} />

          {status.kind === 'done' && (
            <p className={`badge ${issues.length ? 'fail' : 'pass'}`}>
              {issues.length
                ? `${flashes.length} compliance issue${flashes.length === 1 ? '' : 's'} · ${captions.length} readability note${captions.length === 1 ? '' : 's'}`
                : 'Pass'}
            </p>
          )}
          <IssueList issues={issues} onSeek={seek} />
        </>
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
    </main>
  )
}
