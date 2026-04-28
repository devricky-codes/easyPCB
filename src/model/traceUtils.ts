// Utility functions for resolving TraceNode positions and hit-testing traces.
// All coordinates in mm. Keeps model-layer logic out of canvas code.

import type { Point, Trace, TraceNode, Project } from './types';

/** Resolves a single TraceNode to a Point. Returns null if unresolvable. */
export function resolveNodePosition(node: TraceNode, project: Project): Point | null {
  switch (node.kind) {
    case 'hole':
      return project.holes.find((h) => h.id === node.holeId)?.position ?? null;
    case 'point':
      return node.position;
    case 'on_trace': {
      // avoid circular: only resolve non-on_trace nodes of the parent trace
      const parent = project.traces.find((t) => t.id === node.traceId);
      if (!parent || parent.nodes.length < 2) return null;
      const pts = parent.nodes
        .map((n) => (n.kind !== 'on_trace' ? resolveNodePosition(n, project) : null))
        .filter((p): p is Point => p !== null);
      if (pts.length < 2) return null;
      return interpolateAlongPolyline(pts, node.t);
    }
  }
}

/** Resolves all nodes in a trace to an ordered array of Points.
 *  Returns [] if any node cannot be resolved (trace should not be rendered). */
export function resolveTrace(trace: Trace, project: Project): Point[] {
  const pts: Point[] = [];
  for (const node of trace.nodes) {
    const p = resolveNodePosition(node, project);
    if (p === null) return [];
    pts.push(p);
  }
  return pts;
}

/** Interpolates along a polyline at arc-length parameter t ∈ [0,1]. */
export function interpolateAlongPolyline(pts: Point[], t: number): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  t = Math.max(0, Math.min(1, t));

  const lengths: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    lengths.push(
      lengths[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
    );
  }
  const totalLen = lengths[lengths.length - 1];
  if (totalLen === 0) return pts[0];

  const target = t * totalLen;
  for (let i = 1; i < pts.length; i++) {
    if (target <= lengths[i] + 1e-9) {
      const segLen = lengths[i] - lengths[i - 1];
      const localT = segLen === 0 ? 0 : (target - lengths[i - 1]) / segLen;
      return {
        x: pts[i - 1].x + localT * (pts[i].x - pts[i - 1].x),
        y: pts[i - 1].y + localT * (pts[i].y - pts[i - 1].y),
      };
    }
  }
  return pts[pts.length - 1];
}

/** Finds the closest point on a polyline to p.
 *  Returns { t, closest, distMm } where t is arc-length parameterized 0..1. */
export function closestOnPolyline(
  pts: Point[],
  p: Point,
): { t: number; closest: Point; distMm: number } {
  if (pts.length === 0) return { t: 0, closest: { x: 0, y: 0 }, distMm: Infinity };
  if (pts.length === 1) {
    return { t: 0, closest: pts[0], distMm: Math.hypot(p.x - pts[0].x, p.y - pts[0].y) };
  }

  const lengths: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    lengths.push(
      lengths[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
    );
  }
  const totalLen = lengths[lengths.length - 1];

  let bestDist = Infinity;
  let bestT = 0;
  let bestPt: Point = pts[0];

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    const localT =
      len2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
    const cx = a.x + localT * abx;
    const cy = a.y + localT * aby;
    const dist = Math.hypot(p.x - cx, p.y - cy);
    if (dist < bestDist) {
      bestDist = dist;
      bestPt = { x: cx, y: cy };
      const arcLen = lengths[i - 1] + localT * Math.hypot(abx, aby);
      bestT = totalLen === 0 ? 0 : arcLen / totalLen;
    }
  }

  return { t: bestT, closest: bestPt, distMm: bestDist };
}

/** Returns the nearest trace within snapMm of point p, for T-junction snapping.
 *  Only snaps to the interior of the trace (excludes points very close to endpoints). */
export function findTraceAt(
  traces: Trace[],
  project: Project,
  p: Point,
  snapMm: number,
): { traceId: string; t: number; closest: Point } | null {
  let best: { traceId: string; t: number; closest: Point; dist: number } | null = null;
  for (const trace of traces) {
    const pts = resolveTrace(trace, project);
    if (pts.length < 2) continue;
    const { t, closest, distMm } = closestOnPolyline(pts, p);
    if (distMm <= snapMm && (best === null || distMm < best.dist)) {
      best = { traceId: trace.id, t, closest, dist: distMm };
    }
  }
  return best ? { traceId: best.traceId, t: best.t, closest: best.closest } : null;
}
