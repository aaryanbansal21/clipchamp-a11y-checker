import { describe, expect, it } from 'vitest'
import { checkCaptions, parseCaptions } from './captions'

const SRT = `1
00:00:01,000 --> 00:00:03,000
Hello there

2
00:00:04,500 --> 00:00:05,000
<i>Quick</i>

3
00:01:00,000 --> 00:01:02,000
Two
lines
`

const VTT = `WEBVTT

00:01.000 --> 00:03.000
Hello there

00:04.500 --> 00:05.000 line:0
<i>Quick</i>

01:00.000 --> 01:02.000
Two
lines
`

describe('parseCaptions', () => {
  it('parses SRT and VTT to the same cues, stripping tags', () => {
    const expected = [
      { start: 1, end: 3, text: 'Hello there' },
      { start: 4.5, end: 5, text: 'Quick' },
      { start: 60, end: 62, text: 'Two\nlines' },
    ]
    expect(parseCaptions(SRT)).toEqual(expected)
    expect(parseCaptions(VTT)).toEqual(expected)
  })

  it('returns no cues for non-caption text', () => {
    expect(parseCaptions('just some text')).toEqual([])
  })
})

describe('checkCaptions', () => {
  it('flags 40 characters over 1 s as fast with cps 40', () => {
    const text = 'x'.repeat(40)
    const events = checkCaptions([{ start: 0, end: 1, text }])
    expect(events).toEqual([{ kind: 'fast', start: 0, end: 1, text, cps: 40 }])
  })

  it('flags a 0.5 s cue as brief', () => {
    const events = checkCaptions([{ start: 0, end: 0.5, text: 'Hi' }])
    expect(events.map((e) => e.kind)).toEqual(['brief'])
  })

  it('passes a normal cue', () => {
    expect(checkCaptions([{ start: 0, end: 2, text: 'Hello there' }])).toEqual([])
  })
})
