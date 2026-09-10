import type { CaptionEvent, Cue } from './types'

/** Netflix Timed Text Style Guide: 20 characters/second (adult), minimum duration 5/6 s. */
export const CPS_MAX = 20
export const MIN_SECONDS = 5 / 6

const TIME = /(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})/
const secs = (m: RegExpMatchArray) => +(m[1] ?? 0) * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000

/** Parses SRT or WebVTT. Blocks without a `-->` line (WEBVTT header, NOTE) are skipped. */
export function parseCaptions(text: string): Cue[] {
  const cues: Cue[] = []
  for (const block of text.replace(/\r/g, '').split(/\n[ \t]*\n+/)) {
    const lines = block.split('\n')
    const i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0) continue
    const [a, b] = lines[i].split('-->').map((s) => s.match(TIME))
    if (!a || !b) continue
    const body = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim()
    if (body) cues.push({ start: secs(a), end: secs(b), text: body })
  }
  return cues
}

export function checkCaptions(cues: Cue[]): CaptionEvent[] {
  const out: CaptionEvent[] = []
  for (const c of cues) {
    const dur = c.end - c.start
    if (dur <= 0) continue
    const cps = c.text.length / dur
    if (cps > CPS_MAX) out.push({ kind: 'fast', ...c, cps })
    if (dur < MIN_SECONDS) out.push({ kind: 'brief', ...c, cps })
  }
  return out
}
