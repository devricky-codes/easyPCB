import { Layer, Line } from 'react-konva';
import type { Viewport } from './viewport';

type Props = {
  width: number;
  height: number;
  view: Viewport;
  gridMm: number;
};

// Draws a grid in screen space. Computes which mm-grid lines are visible
// and renders them. Subdivides into minor (mm) and major (every 10) lines.
export function GridLayer({ width, height, view, gridMm }: Props) {
  const { pxPerMm, offsetX, offsetY } = view;
  const stepPx = gridMm * pxPerMm;

  // skip rendering if grid lines are too dense (perf)
  if (stepPx < 4) return null;

  const lines: { points: number[]; major: boolean }[] = [];

  // first mm coord visible on screen left edge
  const leftMm = -offsetX / pxPerMm;
  const topMm = -offsetY / pxPerMm;

  const startMmX = Math.floor(leftMm / gridMm) * gridMm;
  const startMmY = Math.floor(topMm / gridMm) * gridMm;
  const endMmX = leftMm + width / pxPerMm;
  const endMmY = topMm + height / pxPerMm;

  for (let mx = startMmX; mx <= endMmX; mx += gridMm) {
    const px = mx * pxPerMm + offsetX;
    const major = Math.abs(Math.round(mx / gridMm) % 10) === 0;
    lines.push({ points: [px, 0, px, height], major });
  }
  for (let my = startMmY; my <= endMmY; my += gridMm) {
    const py = my * pxPerMm + offsetY;
    const major = Math.abs(Math.round(my / gridMm) % 10) === 0;
    lines.push({ points: [0, py, width, py], major });
  }

  // origin axes
  const ox = offsetX;
  const oy = offsetY;

  return (
    <Layer listening={false}>
      {lines.map((l, i) => (
        <Line
          key={i}
          points={l.points}
          stroke={l.major ? '#3a3a3a' : '#2a2a2a'}
          strokeWidth={1}
          listening={false}
        />
      ))}
      <Line points={[ox, 0, ox, height]} stroke="#555" strokeWidth={1} listening={false} />
      <Line points={[0, oy, width, oy]} stroke="#555" strokeWidth={1} listening={false} />
    </Layer>
  );
}
