// Renders live measurement annotations.
//
// measurePoints has 0, 1, 2, or 3 entries:
//   0 — nothing drawn
//   1 — just the first anchor dot
//   2 — distance annotation: A → B  with label (mm)
//   3 — angle annotation: arc at measurePoints[1] between vectors [1→0] and [1→2]
//       plus the two side lines and the distance of each leg
//
// Color scheme: bright green (#22c55e) to distinguish from traces/constraints.
import { Layer, Arrow, Line, Circle, Text, Arc } from 'react-konva';
import type { Point } from '../model/types';
import type { Viewport } from './viewport';
import { mmToPx } from './viewport';

type Props = {
  measurePoints: Point[];
  /** Current cursor mm — used to preview the next segment while placing */
  cursorMm: Point | null;
  view: Viewport;
};

const COLOR = '#22c55e';   // green
const DIM_COLOR = '#fbbf24'; // amber for angle arc
const FONT_SIZE = 12;
const ANCHOR_R = 4;
const ARROW_STROKE = 1.5;
const ARC_RADIUS_PX = 38;

// Convert mm distance to a formatted string
function fmtMm(d: number): string {
  return d < 10 ? `${d.toFixed(3)} mm` : `${d.toFixed(2)} mm`;
}
function fmtDeg(a: number): string {
  return `${a.toFixed(2)}°`;
}

type Pt = { x: number; y: number };

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Midpoint of two screen-space points */
function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Angle (degrees) of vector from → to, measured from +X axis (screen space, Y-down) */
function angleDeg(from: Pt, to: Pt): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
}

/** Perpendicular offset (px) for label — nudge it above the line */
function labelOffset(a: Pt, b: Pt, offset = 14): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Normal pointing "up-left" (rotate 90° CCW)
  return { x: -dy / len * offset, y: dx / len * offset };
}

export function MeasureLayer({ measurePoints, cursorMm, view }: Props) {
  const pts = measurePoints;

  // Effective points list for preview: append cursor if we're mid-measure
  const preview: Point[] = [
    ...pts,
    ...(cursorMm && pts.length > 0 && pts.length < 3 ? [cursorMm] : []),
  ];

  // Work in screen space
  const sPts = preview.map((p) => mmToPx(p, view));

  const elements: React.ReactNode[] = [];

  // Anchor dots for every placed point
  pts.forEach((_, i) => {
    elements.push(
      <Circle
        key={`anchor-${i}`}
        x={sPts[i].x}
        y={sPts[i].y}
        radius={ANCHOR_R}
        fill={COLOR}
        perfectDrawEnabled={false}
      />,
    );
  });

  // ── 2+ points: draw distance segment A → B ───────────────────────────────
  if (sPts.length >= 2) {
    const A = sPts[0];
    const B = sPts[1];
    const distMm = dist(preview[0], preview[1]);
    const m = mid(A, B);
    const off = labelOffset(A, B);
    const isPreview = pts.length < 2; // cursor-only, dim it

    elements.push(
      <Arrow
        key="dist-arrow"
        points={[A.x, A.y, B.x, B.y]}
        stroke={COLOR}
        fill={COLOR}
        strokeWidth={ARROW_STROKE}
        pointerAtBeginning
        pointerAtEnding
        pointerLength={6}
        pointerWidth={5}
        opacity={isPreview ? 0.5 : 1}
        perfectDrawEnabled={false}
      />,
    );
    elements.push(
      <Text
        key="dist-label"
        x={m.x + off.x}
        y={m.y + off.y}
        text={fmtMm(distMm)}
        fontSize={FONT_SIZE}
        fill={COLOR}
        fontFamily="monospace"
        align="center"
        offsetX={30}
        opacity={isPreview ? 0.5 : 1}
        perfectDrawEnabled={false}
      />,
    );
  }

  // ── 3 points: draw angle annotation at B (sPts[1]) ──────────────────────
  if (sPts.length >= 3) {
    const B = sPts[1]; // vertex
    const A = sPts[0];
    const C = sPts[2];

    // Draw side lines B→A and B→C (thin dashes)
    elements.push(
      <Line
        key="angle-lineBA"
        points={[B.x, B.y, A.x, A.y]}
        stroke={DIM_COLOR}
        strokeWidth={1}
        dash={[6, 4]}
        perfectDrawEnabled={false}
      />,
    );
    elements.push(
      <Line
        key="angle-lineBC"
        points={[B.x, B.y, C.x, C.y]}
        stroke={DIM_COLOR}
        strokeWidth={1}
        dash={[6, 4]}
        perfectDrawEnabled={false}
      />,
    );

    // Angle between vectors BA and BC (screen space, Y-down)
    const BAx = A.x - B.x;
    const BAy = A.y - B.y;
    const BCx = C.x - B.x;
    const BCy = C.y - B.y;
    const dot = BAx * BCx + BAy * BCy;
    const cross = BAx * BCy - BAy * BCx;
    const angleMag = Math.abs(Math.atan2(Math.abs(cross), dot)) * 180 / Math.PI;

    // Arc: start at the direction of BA, sweep toward BC
    const startAngleDeg = angleDeg(B, A);
    let sweep = angleDeg(B, C) - startAngleDeg;
    // Normalise to [-180, 180] so we always draw the smaller arc
    while (sweep > 180) sweep -= 360;
    while (sweep < -180) sweep += 360;

    const isPreviewAngle = pts.length < 3;

    elements.push(
      <Arc
        key="angle-arc"
        x={B.x}
        y={B.y}
        innerRadius={ARC_RADIUS_PX - 1}
        outerRadius={ARC_RADIUS_PX + 1}
        angle={Math.abs(sweep)}
        rotation={sweep < 0 ? startAngleDeg + sweep : startAngleDeg}
        fill={DIM_COLOR}
        opacity={isPreviewAngle ? 0.5 : 0.9}
        perfectDrawEnabled={false}
      />,
    );

    // Label at arc midpoint
    const arcMidDeg = (sweep < 0 ? startAngleDeg + sweep : startAngleDeg) + Math.abs(sweep) / 2;
    const arcMidRad = arcMidDeg * Math.PI / 180;
    const labelR = ARC_RADIUS_PX + 18;
    elements.push(
      <Text
        key="angle-label"
        x={B.x + Math.cos(arcMidRad) * labelR - 22}
        y={B.y + Math.sin(arcMidRad) * labelR - 8}
        text={fmtDeg(angleMag)}
        fontSize={FONT_SIZE}
        fill={DIM_COLOR}
        fontFamily="monospace"
        opacity={isPreviewAngle ? 0.5 : 1}
        perfectDrawEnabled={false}
      />,
    );
  }

  if (elements.length === 0) return null;

  return <Layer listening={false}>{elements}</Layer>;
}
