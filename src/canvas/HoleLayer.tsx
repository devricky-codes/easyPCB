import { Layer, Circle } from 'react-konva';
import type { Hole, Selection } from '../model/types';
import type { Viewport } from './viewport';
import { mmToPx } from './viewport';
import { HOLE_RING_PX, SELECT_HALO_PX } from '../constants';

type Props = {
  holes: Hole[];
  selection: Selection;
  view: Viewport;
};

// Colour coding by kind:
//   pad   — copper yellow ring (annular ring exists)
//   via   — cyan ring (small, no component)
//   mount — grey ring (no copper)
const RING_COLOR: Record<string, string> = {
  pad: '#c8a420',
  via: '#4ea1ff',
  mount: '#777777',
};

// Pure visual layer — no event handlers. Hit detection for holes is done at
// the stage level in CanvasRoot so we can cycle through overlapping ones.
export function HoleLayer({ holes, selection, view }: Props) {
  return (
    <Layer listening={false}>
      {holes.map((h) => {
        const p = mmToPx(h.position, view);
        const radiusPx = (h.diameter / 2) * view.pxPerMm;
        const drawRadius = Math.max(radiusPx, 2);
        const selected = selection.kind === 'hole' && selection.id === h.id;
        const kind = h.kind ?? 'pad';
        const ringColor = RING_COLOR[kind];
        return (
          <Circle
            key={h.id}
            x={p.x}
            y={p.y}
            radius={drawRadius}
            stroke={selected ? '#4ea1ff' : ringColor}
            strokeWidth={selected ? SELECT_HALO_PX : HOLE_RING_PX}
            fill="#1a1a1a"
            perfectDrawEnabled={false}
          />
        );
      })}
    </Layer>
  );
}
