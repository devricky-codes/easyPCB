/**
 * LabelLayer — draggable leader-line labels for holes and traces.
 * Feature flag: FEATURES.labels
 *
 * Each label renders as:
 *   • A small rounded-rect chip with the label text
 *   • A thin arrow/line from the chip back to the entity anchor
 *
 * The chip position = entity anchor + labelOffset (mm).
 * Dragging the chip updates labelOffset via setHoleLabelOffset / setTraceLabelOffset.
 *
 * This layer must have listening=false on its Layer wrapper; individual shapes
 * opt-in via listening={true} on the Konva Group.
 */

import { Layer, Group, Rect, Text, Line, Circle } from 'react-konva';
import type Konva from 'konva';
import type { Hole, Point, Project, Trace } from '../model/types';
import type { Viewport } from './viewport';
import { mmToPx, pxToMm } from './viewport';
import { resolveTrace } from '../model/traceUtils';

type Props = {
  project: Project;
  view: Viewport;
  onMoveHoleLabel: (id: string, offset: Point) => void;
  onMoveTraceLabel: (id: string, offset: Point) => void;
};

const CHIP_PAD_X = 5;
const CHIP_PAD_Y = 3;
const FONT_SIZE = 10;
const CHIP_FILL = '#1e293b';
const ARROW_COLOR = '#94a3b8';
const HOLE_LABEL_COLOR = '#fbbf24';
const TRACE_LABEL_COLOR = '#4ade80';

/** Default label offset if none set (mm). */
const DEFAULT_OFFSET: Point = { x: 3, y: -3 };

function traceMidpoint(trace: Trace, project: Project): Point | null {
  const pts = resolveTrace(trace, project);
  if (pts.length < 2) return null;
  // Arc-length midpoint
  let totalLen = 0;
  const segs: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    totalLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(totalLen);
  }
  const half = totalLen / 2;
  for (let i = 1; i < pts.length; i++) {
    if (segs[i] >= half) {
      const segLen = segs[i] - segs[i - 1];
      const t = segLen === 0 ? 0 : (half - segs[i - 1]) / segLen;
      return {
        x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x),
        y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y),
      };
    }
  }
  return pts[pts.length - 1];
}

type LabelItemProps = {
  text: string;
  anchor: Point;     // entity position in mm
  offset: Point;     // label offset from anchor in mm
  color: string;
  view: Viewport;
  onDragEnd: (newOffsetMm: Point) => void;
};

function LabelItem({ text, anchor, offset, color, view, onDragEnd }: LabelItemProps) {
  const anchorPx = mmToPx(anchor, view);
  const chipOriginMm = { x: anchor.x + offset.x, y: anchor.y + offset.y };
  const chipPx = mmToPx(chipOriginMm, view);

  // Measure approximate chip size (fixed font)
  const estimatedWidth = text.length * (FONT_SIZE * 0.62) + CHIP_PAD_X * 2;
  const chipW = Math.max(estimatedWidth, 24);
  const chipH = FONT_SIZE + CHIP_PAD_Y * 2;

  // Arrow: from anchor to nearest edge of chip
  const chipCX = chipPx.x + chipW / 2;
  const chipCY = chipPx.y + chipH / 2;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const newChipPx = { x: node.x(), y: node.y() };
    const newChipMm = pxToMm(newChipPx, view);
    const newOffset: Point = {
      x: Math.round((newChipMm.x - anchor.x) * 100) / 100,
      y: Math.round((newChipMm.y - anchor.y) * 100) / 100,
    };
    onDragEnd(newOffset);
  };

  return (
    <>
      {/* Leader line from entity anchor to chip centre */}
      <Line
        points={[anchorPx.x, anchorPx.y, chipCX, chipCY]}
        stroke={ARROW_COLOR}
        strokeWidth={1}
        dash={[3, 3]}
        opacity={0.7}
        listening={false}
      />
      {/* Anchor dot on entity */}
      <Circle
        x={anchorPx.x}
        y={anchorPx.y}
        radius={2.5}
        fill={color}
        listening={false}
      />
      {/* Draggable chip */}
      <Group
        x={chipPx.x}
        y={chipPx.y}
        draggable
        onDragEnd={handleDragEnd}
        listening={true}
      >
        <Rect
          width={chipW}
          height={chipH}
          fill={CHIP_FILL}
          stroke={color}
          strokeWidth={1}
          cornerRadius={3}
          shadowColor="black"
          shadowBlur={4}
          shadowOpacity={0.4}
        />
        <Text
          x={CHIP_PAD_X}
          y={CHIP_PAD_Y}
          text={text}
          fontSize={FONT_SIZE}
          fontFamily="monospace"
          fill={color}
          listening={false}
        />
      </Group>
    </>
  );
}

export function LabelLayer({ project, view, onMoveHoleLabel, onMoveTraceLabel }: Props) {
  const holeLabels = project.holes.filter((h): h is Hole & { label: string } => !!h.label);
  const traceLabels = project.traces.filter((t): t is Trace & { label: string } => !!t.label);

  return (
    <Layer>
      {holeLabels.map((h) => (
        <LabelItem
          key={h.id}
          text={h.label}
          anchor={h.position}
          offset={h.labelOffset ?? DEFAULT_OFFSET}
          color={HOLE_LABEL_COLOR}
          view={view}
          onDragEnd={(offset) => onMoveHoleLabel(h.id, offset)}
        />
      ))}
      {traceLabels.map((t) => {
        const mid = traceMidpoint(t, project);
        if (!mid) return null;
        return (
          <LabelItem
            key={t.id}
            text={t.label}
            anchor={mid}
            offset={t.labelOffset ?? DEFAULT_OFFSET}
            color={TRACE_LABEL_COLOR}
            view={view}
            onDragEnd={(offset) => onMoveTraceLabel(t.id, offset)}
          />
        );
      })}
    </Layer>
  );
}
