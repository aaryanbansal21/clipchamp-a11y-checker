import type { FlashEvent } from './analysis/types'

/** An edit the checker would hand to the editor. Not applied here: the editor owns the timeline. */
export type Fix = {
  label: string
  op: Record<string, unknown> // the operation payload, keyed by the editor's existing feature
  how: string                 // which existing editor capability would apply it
}

const range = (e: FlashEvent) => ({ start: +e.start.toFixed(2), end: +e.end.toFixed(2) })

export function suggestFixes(e: FlashEvent): Fix[] {
  const r = range(e)
  if (e.kind === 'red') {
    return [{
      label: 'Desaturate red',
      op: { op: 'colorAdjust', ...r, saturation: -0.6, channel: 'red' },
      how: 'Same colour adjustment the Adjust Colours panel applies, scoped to this range as a keyframed effect on the clip.',
    }]
  }
  return [
    {
      label: 'Dim range',
      op: { op: 'colorAdjust', ...r, brightness: -0.3, contrast: -0.4 },
      how: 'Brightness/contrast filter from Adjust Colours, keyframed over this range. Halves the luminance swing so it drops under the 10% threshold.',
    },
    {
      label: 'Slow to 3 Hz',
      op: { op: 'speed', ...r, factor: +(3 / e.peakPerSecond).toFixed(2) },
      how: `Clip speed control on a split of this range. ${e.peakPerSecond} flashes/s × ${(3 / e.peakPerSecond).toFixed(2)} = 3/s, the WCAG limit.`,
    },
  ]
}
