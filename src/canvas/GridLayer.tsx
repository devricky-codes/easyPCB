import { Layer, Line } from 'react-konva';
import type { Viewport } from './viewport';
import { getAdaptiveGridStep } from './viewport';

type Props = {
  width: number;
  height: number;
  view: Viewport;
  gridMm: number; // snap grid step — used to highlight snap-aligned lines
};

/**
 * Draws an adaptive grid:
 *  - Display step auto-scales with zoom (finest cell = 0.01 mm at max zoom).
 *  - Major lines every 10 display steps.
 *  - Lines that coincide with the snap grid are drawn slightly brighter.
 */
export function GridLayer({ width, height, view, gridMm }: Props) {
  const { pxPerMm, offsetX, offsetY } = view;
  const displayStep = getAdaptiveGridStep(pxPerMm);
  const stepPx = displayStep * pxPerMm;

  if (stepPx < MIN_DRAW_PX) return null;

  const leftMm = -offsetX / pxPerMm;
  const topMm  = -offsetY / pxPerMm;
  const endMmX = leftMm + width  / pxPerMm;
  const endMmY = topMm  + height / pxPerMm;

  const startMmX = Math.floor(leftMm / displayStep) * displayStep;
  const startMmY = Math.floor(topMm  / displayStep) * displayStep;

  const majorStep = displayStep * 10;
  const EPS = displayStep * 0.01;

  function lineKind(v: number): 'major' | 'snap' | 'minor' {
    const nearZero = (x: number, mod: number) => {
      const r = ((x % mod) + mod) % mod;
      return r < EPS || r > mod - EPS;
    };
    if (nearZero(v, majorStep)) return 'major';
    if (gridMm >= displayStep && nearZero(v, gridMm)) return 'snap';
    return 'minor';
  }

  const vLines: { px: number; kind: 'major' | 'snap' | 'minor' }[] = [];
  const hLines: { py: number; kind: 'major' | 'snap' | 'minor' }[] = [];

  for (let mx = startMmX; mx <= endMmX + EPS; mx += displayStep) {
    const rounded = Math.round(mx / displayStep) * displayStep;
    vLines.push({ px: rounded * pxPerMm + offsetX, kind: lineKind(rounded) });
  }
  for (let my = startMmY; my <= endMmY + EPS; my += displayStep) {
    const rounded = Math.round(my / displayStep) * displayStep;
    hLines.push({ py: rounded * pxPerMm + offsetY, kind: lineKind(rounded) });
  }

  const COLOR: Record<string, string> = { major: '#3a3a3a', snap: '#323232', minor: '#252525' };
  const ox = offsetX;
  const oy = offsetY;

  return (
    <Layer listening={false}>
      {vLines.map((l, i) => (
        <Line key={`v${i}`} points={[l.px, 0, l.px, height]} stroke={COLOR[l.kind]} strokeWidth={1} listening={false} />
      ))}
      {hLines.map((l, i) => (
        <Line key={`h${i}`} points={[0, l.py, width, l.py]} stroke={COLOR[l.kind]} strokeWidth={1} listening={false} />
      ))}
      {/* Origin axes */}
      <Line points={[ox, 0, ox, height]} stroke="#555" strokeWidth={1} listening={false} />
      <Line points={[0, oy, width, oy]} stroke="#555" strokeWidth={1} listening={false} />
    </Layer>
  );
}

const MIN_DRAW_PX = 2;
