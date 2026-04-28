// Viewport math. mm <-> screen px.
// Screen origin is top-left of stage. Model origin is wherever offset puts it.

export type Viewport = { pxPerMm: number; offsetX: number; offsetY: number };

export function mmToPx(p: { x: number; y: number }, v: Viewport) {
  return { x: p.x * v.pxPerMm + v.offsetX, y: p.y * v.pxPerMm + v.offsetY };
}

export function pxToMm(p: { x: number; y: number }, v: Viewport) {
  return { x: (p.x - v.offsetX) / v.pxPerMm, y: (p.y - v.offsetY) / v.pxPerMm };
}

export function snap(value: number, step: number) {
  return Math.round(value / step) * step;
}

export function snapPoint(p: { x: number; y: number }, step: number) {
  return { x: snap(p.x, step), y: snap(p.y, step) };
}

/**
 * Canonical grid steps in mm, from finest to coarsest.
 * The 0.01 mm entry is the measurement resolution floor (reachable at max zoom).
 */
const GRID_STEPS_MM = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

/** Minimum grid-line spacing in pixels before a step is considered too dense. */
const MIN_GRID_PX = 4;

/**
 * Returns the finest grid step (mm) that is still visible at the given zoom.
 *   10  px/mm  →  1    mm  (default view)
 *   50  px/mm  →  0.1  mm
 *   200 px/mm  →  0.02 mm
 *   400 px/mm  →  0.01 mm (maximum zoom, finest resolution)
 */
export function getAdaptiveGridStep(pxPerMm: number): number {
  for (const s of GRID_STEPS_MM) {
    if (s * pxPerMm >= MIN_GRID_PX) return s;
  }
  return 100;
}

/** Format a grid step value for display, e.g. 0.01 → "0.01 mm", 1 → "1 mm" */
export function fmtGridStep(mm: number): string {
  // Use toPrecision to drop trailing zeros from decimal steps
  const s = mm < 1 ? mm.toPrecision(1) : String(mm);
  return `${s} mm`;
}
