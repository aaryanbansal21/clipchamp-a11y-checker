# Video Accessibility Checker

Scans a video for flashing content that fails **WCAG 2.3.1** and checks caption files for readability — entirely in the browser. Nothing is uploaded.

**Live:** _(Vercel URL)_

## Why

- The **European Accessibility Act** has applied since 28 June 2025. Its technical standard, EN 301 549, includes WCAG 2.3.1 (Three Flashes or Below Threshold).
- Flashing content can trigger seizures in up to **1 in 4,000** people (Epilepsy Foundation, *Epilepsia* 2022).
- About **75%** of mobile video is watched on mute, so captions that are too fast to read lose viewers.
- YouTube and Vimeo already run flash analysis at upload. An editor can catch it before export.

This is a compliance aid, not a certification. The compliance decision stays with the publisher.

## How it works

```
file → Mediabunny demux → VideoDecoder (WebCodecs, in a Worker, with back-pressure)
     → 64×36 luminance grid → WCAG 2.3.1 flash counter → timeline
```

Same shape as Clipchamp's public export pipeline (decode → compose → encode), with the compositor and encoder replaced by an analyser. Inside an editor this would sit after the compositor so titles and effects are included.

- **Compliance:** general flash (≥10% luminance swing over ≥25% of the frame, >3 per second) and red flash (saturated-red transitions), per WCAG 2.3.1. The detector is streaming: it keeps a one-second sliding window of transitions, so a one-second burst inside a long calm video is caught rather than averaged away.
- **Readability:** captions faster than 20 characters/second or shorter than 5/6 s (Netflix/BBC guidelines).
- **Luminance trace:** the timeline shows mean frame luminance so you can see the oscillation the detector is counting.

Simplifications a production version would tighten: area is measured against the whole frame rather than WCAG's 341×256 px viewport window; colour is averaged per grid cell.

## Run

```bash
npm install
npm run dev        # Chrome / Edge / Safari 16.4+
npm test           # unit tests for the analysis modules
./scripts/make-fixtures.sh   # regenerate the sample videos (needs ffmpeg)
```

`src/analysis/` is browser-free TypeScript with Vitest coverage. `src/worker/` is the WebCodecs pipeline. `src/ui/` is the timeline and issue list.
