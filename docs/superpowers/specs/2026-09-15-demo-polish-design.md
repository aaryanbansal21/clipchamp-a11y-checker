# Demo polish: deploy, samples, report, luminance trace

Goal: a live URL a reviewer can open and get a result from in one click, plus one
visible "show your work" feature that makes the flash detector legible.

## 1. Deploy + README
- Push to GitHub (`gh repo create clipchamp-a11y-checker --public --source=. --push`).
- Deploy with `vercel --prod` (Vite preset, no config).
- README from the existing plan's Task 8 text, with the live URL filled in.

## 2. Sample videos
- Move the four fixtures (`flash-5hz`, `red-5hz`, `burst-in-calm`, `steady`; <80 KB total)
  into `public/samples/` so they ship with the build. `scripts/make-fixtures.sh` writes there.
- Empty state shows a "Try a sample" row of four buttons. Clicking one fetches the file,
  wraps it in a `File`, and feeds the existing `setFile` path. No new state.

## 3. Copy report
- Button in the done-state panel head. Builds a plain-text summary (file name, duration,
  verdict, one line per issue with time range, title, detail) and writes it with
  `navigator.clipboard.writeText`. Button label flips to "Copied" for 1.5 s.

## 4. Luminance trace lane
- Worker: mean of the `lum` grid per frame is already computable in `toGrids`' consumer.
  Post `{ type: 'sample', t, lum }` per frame. At 64×36 cells this is one number per frame;
  batch into arrays of up to 64 samples to keep message count low.
- Main thread: append to a `Float32Array`-backed list `[t, lum]`; pass to `Timeline` as
  `trace`.
- Timeline: new lane at the top, "Luminance", rendered as an inline `<svg>` polyline
  (`preserveAspectRatio="none"`, `viewBox="0 0 W 1"`), y = 1 − lum. Compliance markers sit
  directly beneath so the flash region lines up with the oscillation.
- Downsample in the render: at most ~2000 points (stride = ceil(n / 2000)).

## Tests
- `checkCaptions`/`FlashDetector` untouched. New: `buildReport()` in `src/report.ts` with one
  Vitest case (pure text function). Trace batching in the worker is not unit-tested
  (WebCodecs), verified in the browser against `flash-5hz` and `steady`.

## Order
1 → 2 → 3 → 4. Deploy again after each step lands. Step 4 is cut if time runs out.
