import { Layer, Circle, Line, Text } from 'react-konva';
import type { Point } from '../model/types';
import type { Viewport } from './viewport';
import { mmToPx } from './viewport';
import { CHAIN_PITCH_MM, DEFAULT_HOLE_DIAMETER_MM } from '../constants';

type Props = {
  startPos: Point;
  cursorMm: Point | null;
  view: Viewport;
};

/**
 * Compute preview hole positions along the line from startPos toward cursorMm.
 * First hole is always at startPos; additional holes at CHAIN_PITCH_MM intervals.
 */
export function computeChainPositions(startPos: Point, cursorMm: Point): Point[] {
  const dx = cursorMm.x - startPos.x;
  const dy = cursorMm.y - startPos.y;
  const dist = Math.hypot(dx, dy);
  const extra = dist < 1e-6 ? 0 : Math.floor(dist / CHAIN_PITCH_MM);
  if (extra === 0) return [startPos];
  const nx = dx / dist;
  const ny = dy / dist;
  const pts: Point[] = [];
  for (let i = 0; i <= extra; i++) {
    pts.push({ x: startPos.x + nx * CHAIN_PITCH_MM * i, y: startPos.y + ny * CHAIN_PITCH_MM * i });
  }
  return pts;
}

export function ChainLayer({ startPos, cursorMm, view }: Props) {
  const positions = cursorMm ? computeChainPositions(startPos, cursorMm) : [startPos];
  const radiusPx = Math.max((DEFAULT_HOLE_DIAMETER_MM / 2) * view.pxPerMm, 2);

  // Flatten all positions into [x0, y0, x1, y1, ...] for the connecting line
  const linePoints = positions.flatMap((p) => {
    const px = mmToPx(p, view);
    return [px.x, px.y];
  });

  const lastPos = positions[positions.length - 1];
  const lastPx = mmToPx(lastPos, view);

  return (
    <Layer listening={false}>
      {/* dashed spine connecting all preview pads */}
      {positions.length > 1 && (
        <Line
          points={linePoints}
          stroke="#f59e0b"
          strokeWidth={1}
          dash={[4, 3]}
          opacity={0.55}
          perfectDrawEnabled={false}
        />
      )}

      {/* ghost pad circles */}
      {positions.map((p, i) => {
        const px = mmToPx(p, view);
        return (
          <Circle
            key={i}
            x={px.x}
            y={px.y}
            radius={radiusPx}
            stroke="#f59e0b"
            strokeWidth={2}
            fill={i === 0 ? 'rgba(245,158,11,0.25)' : 'rgba(26,26,26,0.5)'}
            opacity={0.85}
            perfectDrawEnabled={false}
          />
        );
      })}

      {/* count badge near the last pad */}
      {positions.length > 0 && (
        <Text
          x={lastPx.x + 8}
          y={lastPx.y - 14}
          text={`${positions.length} × 2.54 mm`}
          fontSize={11}
          fill="#f59e0b"
          perfectDrawEnabled={false}
        />
      )}
    </Layer>
  );
}
