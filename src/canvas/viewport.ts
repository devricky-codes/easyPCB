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
