export type Grids = { lum: Float32Array; red: Uint8Array }

/** sRGB channel (0–255) → linear (0–1), per WCAG relative luminance definition. */
const lin = (c: number) => {
  c /= 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/**
 * RGBA bytes (from getImageData) → per-cell relative luminance and saturated-red flag.
 * Saturated red follows the PEAT definition: R/(R+G+B) ≥ 0.8 and (R−G−B) × 320 > 20 on 0–1 values.
 */
export function toGrids(data: Uint8ClampedArray, cells: number): Grids {
  const lum = new Float32Array(cells)
  const red = new Uint8Array(cells)
  for (let i = 0; i < cells; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    lum[i] = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    const sum = r + g + b
    red[i] = sum > 0 && r / sum >= 0.8 && ((r - g - b) / 255) * 320 > 20 ? 1 : 0
  }
  return { lum, red }
}
