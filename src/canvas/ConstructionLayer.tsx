// Renders construction / guide lines — visual aids that are never exported to Gerber.
// Lines are drawn as infinite (extending well beyond the viewport) so they feel like
// traditional CAD construction lines.
import { Layer, Line, Circle, Group } from 'react-konva';
import type { ConstructionLine, Point } from '../model/types';
import type { Viewport } from './viewport';
import { mmToPx } from './viewport';

type Props = {
  lines: ConstructionLine[];
  /** First point placed when drawing a new construction line. */
  draftConstrStart: Point | null;
  /** Current cursor position in mm (for previewing the draft). */
  cursorMm: Point | null;
  view: Viewport;
  visible: boolean;
  /** ID of the currently selected construction line (for highlight). */
  selectedId: string | null;
};

const CL_COLOR = '#a855f7'; // purple
const CL_COLOR_SELECTED = '#e879f9'; // bright fuchsia when selected
const CL_DASH = [10, 7];
const CL_STROKE = 1;
const CL_STROKE_SELECTED = 2.5;
const ENDPOINT_RADIUS = 3; // px
/** How far (mm) to extend past each endpoint to look "infinite". */
const EXTEND_MM = 2000;

function extendLine(a: Point, b: Point): { p1: Point; p2: Point } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { p1: a, p2: b };
  const ux = dx / len;
  const uy = dy / len;
  return {
    p1: { x: a.x - ux * EXTEND_MM, y: a.y - uy * EXTEND_MM },
    p2: { x: b.x + ux * EXTEND_MM, y: b.y + uy * EXTEND_MM },
  };
}

export function ConstructionLayer({ lines, draftConstrStart, cursorMm, view, visible, selectedId }: Props) {
  if (!visible) return null;

  const renderLine = (cl: ConstructionLine, key: string, isDraft = false) => {
    const isSelected = !isDraft && cl.id === selectedId;
    const { p1, p2 } = extendLine(cl.start, cl.end);
    const sp1 = mmToPx(p1, view);
    const sp2 = mmToPx(p2, view);
    const sStart = mmToPx(cl.start, view);
    const sEnd = mmToPx(cl.end, view);
    const opacity = isDraft ? 0.55 : 0.85;
    const color = isSelected ? CL_COLOR_SELECTED : CL_COLOR;
    const strokeW = isSelected ? CL_STROKE_SELECTED : CL_STROKE;

    return (
      <Group key={key} opacity={opacity}>
        {/* Infinite extension in both directions */}
        <Line
          points={[sp1.x, sp1.y, sp2.x, sp2.y]}
          stroke={color}
          strokeWidth={strokeW}
          dash={CL_DASH}
          perfectDrawEnabled={false}
        />
        {/* Endpoint markers */}
        <Circle
          x={sStart.x}
          y={sStart.y}
          radius={isSelected ? ENDPOINT_RADIUS + 1 : ENDPOINT_RADIUS}
          fill={color}
          perfectDrawEnabled={false}
        />
        {!isDraft && (
          <Circle
            x={sEnd.x}
            y={sEnd.y}
            radius={isSelected ? ENDPOINT_RADIUS + 1 : ENDPOINT_RADIUS}
            fill={color}
            perfectDrawEnabled={false}
          />
        )}
      </Group>
    );
  };

  // Draft line: from draftConstrStart to current cursor
  const draftEl =
    draftConstrStart && cursorMm
      ? renderLine(
          { id: '__draft__', start: draftConstrStart, end: cursorMm },
          '__draft__',
          true,
        )
      : null;

  // Just the start-point dot when no cursor yet
  const draftStartDot =
    draftConstrStart && !cursorMm ? (
      <Circle
        key="__draft_start__"
        x={mmToPx(draftConstrStart, view).x}
        y={mmToPx(draftConstrStart, view).y}
        radius={ENDPOINT_RADIUS}
        fill={CL_COLOR}
        opacity={0.55}
      />
    ) : null;

  return (
    <Layer listening={false}>
      {lines.map((cl) => renderLine(cl, cl.id))}
      {draftEl}
      {draftStartDot}
    </Layer>
  );
}
