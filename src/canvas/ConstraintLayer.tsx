// Renders dimension annotations for driving constraints on the canvas.
// All coordinates are computed in screen-pixel space from mm model coordinates.
// Y-axis is down in both model and screen space.

import { Layer, Line, Arrow, Text, Circle } from 'react-konva';
import type { Constraint, Project, Selection } from '../model/types';
import type { Viewport } from './viewport';
import { mmToPx } from './viewport';

type Pt = { x: number; y: number };

const DIM_COLOR = '#7ecbff';   // blue-ish dimension colour
const DIM_CONFLICT = '#ff6b6b'; // red for conflicting constraints
const OFFSET_PX = 38;           // how far from geometry to place the dimension line
const ARROW_SIZE = 6;
const FONT_SIZE = 10;
const EXT_OVERSHOOT_PX = 6;    // extension lines extend this far past the dim line

type Props = {
  project: Project;
  view: Viewport;
  selection: Selection;
  conflictingIds: string[];
};

export function ConstraintLayer({ project, view, conflictingIds }: Props) {
  return (
    <Layer listening={false}>
      {project.constraints.map((c) => (
        <ConstraintAnnotation
          key={c.id}
          constraint={c}
          project={project}
          view={view}
          isConflict={conflictingIds.includes(c.id)}
        />
      ))}
    </Layer>
  );
}

function ConstraintAnnotation({
  constraint: c,
  project,
  view,
  isConflict,
}: {
  constraint: Constraint;
  project: Project;
  view: Viewport;
  isConflict: boolean;
}) {
  const color = isConflict ? DIM_CONFLICT : DIM_COLOR;

  if (c.type === 'distance' && c.entityIds.length >= 2) {
    const p1mm = resolveEntityPoint(c.entityIds[0], project);
    // For hole↔edge, compute the foot of perpendicular as the second point
    const p2mm = c.entityIds[1].startsWith('be_')
      ? resolveEdgeFoot(c.entityIds[0], c.entityIds[1], project)
      : resolveEntityPoint(c.entityIds[1], project);

    if (!p1mm || !p2mm) return null;

    const p1 = mmToPx(p1mm, view);
    const p2 = mmToPx(p2mm, view);

    const label = formatValue(c.value, project);
    return <DistanceDimension p1={p1} p2={p2} label={label} color={color} />;
  }

  if (c.type === 'fixed' && c.entityIds.length >= 1) {
    const pmm = resolveEntityPoint(c.entityIds[0], project);
    if (!pmm) return null;
    const p = mmToPx(pmm, view);
    return <FixedMarker p={p} color={color} />;
  }

  if ((c.type === 'horizontal' || c.type === 'vertical') && c.entityIds.length >= 1) {
    const midMm = resolveEntityMidpoint(c.entityIds[0], project);
    if (!midMm) return null;
    const mid = mmToPx(midMm, view);
    return <HVMarker p={mid} label={c.type === 'horizontal' ? 'H' : 'V'} color={color} />;
  }

  if (c.type === 'coincident' && c.entityIds.length >= 2) {
    const pmm = resolveEntityPoint(c.entityIds[0], project);
    if (!pmm) return null;
    const p = mmToPx(pmm, view);
    return <CoincidentMarker p={p} color={color} />;
  }

  return null;
}

// ─── Dimension shapes ─────────────────────────────────────────────────────────

function DistanceDimension({
  p1,
  p2,
  label,
  color,
}: {
  p1: Pt;
  p2: Pt;
  label: string;
  color: string;
}) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return null; // too close to render

  // Unit direction p1→p2
  const ux = dx / len;
  const uy = dy / len;
  // "Above" perpendicular (CW in screen space = visually upward for horizontal lines)
  const nx = uy;
  const ny = -ux;

  // Extension line endpoints
  const ext1Start: Pt = { x: p1.x + nx * 6,  y: p1.y + ny * 6 };
  const ext1End: Pt   = { x: p1.x + nx * (OFFSET_PX + EXT_OVERSHOOT_PX), y: p1.y + ny * (OFFSET_PX + EXT_OVERSHOOT_PX) };
  const ext2Start: Pt = { x: p2.x + nx * 6,  y: p2.y + ny * 6 };
  const ext2End: Pt   = { x: p2.x + nx * (OFFSET_PX + EXT_OVERSHOOT_PX), y: p2.y + ny * (OFFSET_PX + EXT_OVERSHOOT_PX) };

  // Dimension line (offset from the geometry)
  const dim1: Pt = { x: p1.x + nx * OFFSET_PX, y: p1.y + ny * OFFSET_PX };
  const dim2: Pt = { x: p2.x + nx * OFFSET_PX, y: p2.y + ny * OFFSET_PX };

  // Text position: midpoint of dimension line, shifted a little further out
  const midX = (dim1.x + dim2.x) / 2;
  const midY = (dim1.y + dim2.y) / 2;
  const textX = midX + nx * (FONT_SIZE + 2);
  const textY = midY + ny * (FONT_SIZE + 2);

  // Angle for the text label (match the dimension line direction)
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Flip text if it would be upside down
  const textRotation = angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg;

  return (
    <>
      {/* Extension lines */}
      <Line
        points={[ext1Start.x, ext1Start.y, ext1End.x, ext1End.y]}
        stroke={color}
        strokeWidth={1}
        opacity={0.7}
        dash={[2, 2]}
      />
      <Line
        points={[ext2Start.x, ext2Start.y, ext2End.x, ext2End.y]}
        stroke={color}
        strokeWidth={1}
        opacity={0.7}
        dash={[2, 2]}
      />
      {/* Dimension line with arrow heads at both ends */}
      <Arrow
        points={[dim1.x, dim1.y, dim2.x, dim2.y]}
        stroke={color}
        strokeWidth={1.5}
        fill={color}
        pointerLength={ARROW_SIZE}
        pointerWidth={ARROW_SIZE * 0.6}
        pointerAtBeginning
        opacity={0.9}
      />
      {/* Value label */}
      <Text
        x={textX}
        y={textY}
        text={label}
        fontSize={FONT_SIZE}
        fill={color}
        rotation={textRotation}
        offsetX={label.length * (FONT_SIZE * 0.3)}
        offsetY={FONT_SIZE / 2}
        fontFamily="monospace"
        opacity={0.95}
      />
    </>
  );
}

function FixedMarker({ p, color }: { p: Pt; color: string }) {
  const r = 6;
  return (
    <>
      <Line points={[p.x - r, p.y, p.x + r, p.y]} stroke={color} strokeWidth={1} opacity={0.7} />
      <Line points={[p.x, p.y - r, p.x, p.y + r]} stroke={color} strokeWidth={1} opacity={0.7} />
      <Circle x={p.x} y={p.y} radius={2.5} stroke={color} strokeWidth={1} opacity={0.8} />
    </>
  );
}

function HVMarker({ p, label, color }: { p: Pt; label: string; color: string }) {
  return (
    <Text
      x={p.x + 8}
      y={p.y - 8}
      text={label}
      fontSize={FONT_SIZE + 1}
      fill={color}
      fontFamily="monospace"
      fontStyle="bold"
      opacity={0.8}
    />
  );
}

function CoincidentMarker({ p, color }: { p: Pt; color: string }) {
  return (
    <Circle
      x={p.x}
      y={p.y}
      radius={5}
      stroke={color}
      strokeWidth={1.5}
      dash={[2, 2]}
      opacity={0.7}
    />
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Resolve an entity ID (hole, bv_, bv vertex) to a Point in mm. */
function resolveEntityPoint(
  entityId: string,
  project: Project,
): { x: number; y: number } | null {
  if (entityId.startsWith('bv_')) {
    // bv_<boardId>_<index>
    const parts = entityId.split('_');
    const idx = parseInt(parts[parts.length - 1], 10);
    if (!project.board || isNaN(idx)) return null;
    return project.board.vertices[idx] ?? null;
  }
  if (entityId.startsWith('be_')) {
    // For an edge entity, return the midpoint of the edge as a representative point
    const parts = entityId.split('_');
    const idx = parseInt(parts[parts.length - 1], 10);
    if (!project.board || isNaN(idx)) return null;
    const n = project.board.vertices.length;
    const a = project.board.vertices[idx];
    const b = project.board.vertices[(idx + 1) % n];
    if (!a || !b) return null;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  const hole = project.holes.find((h) => h.id === entityId);
  return hole?.position ?? null;
}

/**
 * For a hole↔board-edge distance, compute the foot of the perpendicular from
 * the hole to the edge (the closest point on the edge line).
 */
function resolveEdgeFoot(
  holeId: string,
  edgeId: string,
  project: Project,
): { x: number; y: number } | null {
  const hole = project.holes.find((h) => h.id === holeId);
  if (!hole || !project.board) return null;
  const parts = edgeId.split('_');
  const idx = parseInt(parts[parts.length - 1], 10);
  if (isNaN(idx)) return null;
  const n = project.board.vertices.length;
  const a = project.board.vertices[idx];
  const b = project.board.vertices[(idx + 1) % n];
  if (!a || !b) return null;

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((hole.position.x - a.x) * abx + (hole.position.y - a.y) * aby) / len2));
  return { x: a.x + t * abx, y: a.y + t * aby };
}

/** Resolve m entity ID to the midpoint of the trace or edge (for HV markers). */
function resolveEntityMidpoint(
  entityId: string,
  project: Project,
): { x: number; y: number } | null {
  if (entityId.startsWith('be_')) {
    return resolveEntityPoint(entityId, project); // midpoint is the representative
  }
  const trace = project.traces.find((t) => t.id === entityId);
  if (!trace || trace.nodes.length < 2) return null;
  // Take the midpoint between first and last node
  const first = trace.nodes[0];
  const last = trace.nodes[trace.nodes.length - 1];
  const p1 = resolveNodePos(first, project);
  const p2 = resolveNodePos(last, project);
  if (!p1 || !p2) return null;
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

function resolveNodePos(
  node: Project['traces'][number]['nodes'][number],
  project: Project,
): { x: number; y: number } | null {
  if (node.kind === 'point') return node.position;
  if (node.kind === 'hole') return project.holes.find((h) => h.id === node.holeId)?.position ?? null;
  return null; // on_trace: skip
}

function formatValue(value: number | string | undefined, project: Project): string {
  if (value === undefined) return '?';
  if (typeof value === 'string') {
    const param = project.parameters.find((p) => p.name === value);
    return param !== undefined ? `${value}=${param.value}` : value;
  }
  return `${value}`;
}
