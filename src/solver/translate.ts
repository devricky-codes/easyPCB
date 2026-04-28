// Translates the EasyPCB Project model into planegcs SketchPrimitive objects.
// Returns the primitives array plus metadata for reading solved positions back
// into the model (readback map) and for mapping model constraint IDs to GCS line IDs.

import type { Project } from '../model/types';
import type {
  SketchPrimitive,
  SketchPoint,
  SketchLine,
  P2PDistance,
  P2LDistance,
  P2PCoincident,
  Horizontal_L,
  Vertical_L,
  Perpendicular_LL,
  L2LAngle_LL,
  PointOnLine_PL,
} from '@salusoft89/planegcs';
import { resolveNodePosition } from '../model/traceUtils';

/** Describes how to patch a model entity from a solved GCS point. */
export type ReadbackEntry =
  | { kind: 'hole'; holeId: string }
  | { kind: 'traceNode'; traceId: string; nodeIndex: number }
  | { kind: 'boardVertex'; boardId: string; vertexIndex: number };

export type TranslateResult = {
  primitives: SketchPrimitive[];
  /** planegcs point-id → what to update after solve */
  readback: Map<string, ReadbackEntry>;
  /** traceId → GCS line-id[] (one per segment, in order) */
  traceLineMap: Map<string, string[]>;
  /** holeId → planegcs point-id */
  holePointMap: Map<string, string>;
  /** entity-id (bv_<boardId>_<i>) → planegcs point-id (board vertices are fixed) */
  boardVertexPointMap: Map<string, string>;
  /** entity-id (be_<boardId>_<i>) → planegcs line-id (board edges are fixed) */
  boardEdgeLineMap: Map<string, string>;
  /** entity-id (cl_<constructionLine.id>) → planegcs line-id (construction lines are fixed) */
  constrLineMap: Map<string, string>;
};

function resolveParamValue(
  value: number | string | undefined,
  parameters: Project['parameters'],
): number | null {
  if (value === undefined) return null;
  if (typeof value === 'number') return value;
  return parameters.find((p) => p.name === value)?.value ?? null;
}

export function translateProject(project: Project): TranslateResult {
  const primitives: SketchPrimitive[] = [];
  const readback = new Map<string, ReadbackEntry>();
  const traceLineMap = new Map<string, string[]>();
  const holePointMap = new Map<string, string>();
  const boardVertexPointMap = new Map<string, string>();
  const boardEdgeLineMap = new Map<string, string>();
  const constrLineMap = new Map<string, string>(); // entity-id (cl_<id>) → GCS line-id

  // Which holes are pinned via 'fixed' constraint
  const fixedHoleIds = new Set(
    project.constraints
      .filter((c) => c.type === 'fixed' && c.entityIds.length >= 1)
      .map((c) => c.entityIds[0]),
  );

  // Which board vertices are explicitly pinned via 'fixed' constraint
  const fixedBoardVertexEntityIds = new Set(
    project.constraints
      .filter((c) => c.type === 'fixed' && c.entityIds.length >= 1)
      .map((c) => c.entityIds[0])
      .filter((id) => id.startsWith('bv_')),
  );

  // ─── Pass 0: board vertices + edges → fixed primitives ───────────────────
  // Board outline is the reference frame; all board geometry is fixed.
  if (project.board) {
    const { id: boardId, vertices } = project.board;
    const n = vertices.length;
    const vertPtIds: string[] = [];

    for (let i = 0; i < n; i++) {
      const entityId = `bv_${boardId}_${i}`;
      const ptId = `pt_${entityId}`;
      vertPtIds.push(ptId);
      boardVertexPointMap.set(entityId, ptId);
      // Vertex 0 is always the reference anchor (fixed). Other vertices are free
      // so that edge-length constraints can reshape the board.
      // A vertex with an explicit 'fixed' constraint is also pinned.
      const isFixed = i === 0 || fixedBoardVertexEntityIds.has(entityId);
      primitives.push({
        id: ptId,
        type: 'point',
        x: vertices[i].x,
        y: vertices[i].y,
        fixed: isFixed,
      } satisfies SketchPoint);
      // Register free vertices for readback so solved positions are written back.
      if (!isFixed) {
        readback.set(ptId, { kind: 'boardVertex', boardId, vertexIndex: i });
      }
    }

    for (let i = 0; i < n; i++) {
      const entityId = `be_${boardId}_${i}`;
      const lineId = `seg_${entityId}`;
      boardEdgeLineMap.set(entityId, lineId);
      primitives.push({
        id: lineId,
        type: 'line',
        p1_id: vertPtIds[i],
        p2_id: vertPtIds[(i + 1) % n],
      } satisfies SketchLine);
    }
  }

  // ─── Pass 0b: construction lines → fixed SketchLines ─────────────────────
  for (const cl of project.constructionLines) {
    const entityId = `cl_${cl.id}`;
    const p1Id = `pt_cl_${cl.id}_0`;
    const p2Id = `pt_cl_${cl.id}_1`;
    const lineId = `seg_cl_${cl.id}`;
    // Points for the construction line (fixed — guide lines don't move)
    primitives.push({ id: p1Id, type: 'point', x: cl.start.x, y: cl.start.y, fixed: true } satisfies SketchPoint);
    primitives.push({ id: p2Id, type: 'point', x: cl.end.x, y: cl.end.y, fixed: true } satisfies SketchPoint);
    primitives.push({ id: lineId, type: 'line', p1_id: p1Id, p2_id: p2Id } satisfies SketchLine);
    constrLineMap.set(entityId, lineId);
  }

  // ─── Pass 1: holes → SketchPoint ──────────────────────────────────────────
  for (const hole of project.holes) {
    const ptId = `pt_${hole.id}`;
    holePointMap.set(hole.id, ptId);
    primitives.push({
      id: ptId,
      type: 'point',
      x: hole.position.x,
      y: hole.position.y,
      fixed: fixedHoleIds.has(hole.id),
    } satisfies SketchPoint);
    readback.set(ptId, { kind: 'hole', holeId: hole.id });
  }

  // ─── Pass 2: trace nodes + line segments ──────────────────────────────────
  // Build nodePointIds per trace first, then emit line primitives.
  const traceNodePointIds = new Map<string, string[]>();

  for (const trace of project.traces) {
    const nodePointIds: string[] = [];

    for (let i = 0; i < trace.nodes.length; i++) {
      const node = trace.nodes[i];
      if (node.kind === 'hole') {
        // Reuse the hole's point
        nodePointIds.push(holePointMap.get(node.holeId) ?? `missing_${node.holeId}`);
      } else {
        // 'point' or 'on_trace': emit a standalone GCS point
        const ptId = `pt_${trace.id}_n${i}`;
        nodePointIds.push(ptId);
        const resolved = resolveNodePosition(node, project);
        const pos = resolved ?? { x: 0, y: 0 };
        primitives.push({
          id: ptId,
          type: 'point',
          x: pos.x,
          y: pos.y,
          fixed: false,
        } satisfies SketchPoint);
        readback.set(ptId, { kind: 'traceNode', traceId: trace.id, nodeIndex: i });
      }
    }

    traceNodePointIds.set(trace.id, nodePointIds);

    // Line segments
    const lineIds: string[] = [];
    for (let i = 0; i < nodePointIds.length - 1; i++) {
      const lineId = `line_${trace.id}_s${i}`;
      lineIds.push(lineId);
      primitives.push({
        id: lineId,
        type: 'line',
        p1_id: nodePointIds[i],
        p2_id: nodePointIds[i + 1],
      } satisfies SketchLine);
    }
    traceLineMap.set(trace.id, lineIds);
  }

  // ─── Pass 3: on_trace → point_on_line_pl ──────────────────────────────────
  for (const trace of project.traces) {
    const nodePointIds = traceNodePointIds.get(trace.id)!;
    for (let i = 0; i < trace.nodes.length; i++) {
      const node = trace.nodes[i];
      if (node.kind !== 'on_trace') continue;
      const parentLines = traceLineMap.get(node.traceId);
      if (!parentLines || parentLines.length === 0) continue;
      // Pick the segment the t-parameter falls on
      const parent = project.traces.find((t) => t.id === node.traceId);
      const segCount = parent ? parent.nodes.length - 1 : 1;
      const segIdx = Math.min(Math.floor(node.t * segCount), parentLines.length - 1);
      primitives.push({
        id: `pol_${trace.id}_n${i}`,
        type: 'point_on_line_pl',
        p_id: nodePointIds[i],
        l_id: parentLines[Math.max(0, segIdx)],
      } satisfies PointOnLine_PL);
    }
  }

  // ─── Pass 4: model constraints → GCS constraints ──────────────────────────
  for (const c of project.constraints) {
    if (c.type === 'fixed') continue; // expressed via SketchPoint.fixed
    const gcsId = `gcs_${c.id}`;
    const e = c.entityIds;

    /** Look up a GCS point-id for an entity that may be a hole OR a board vertex. */
    const resolvePoint = (entityId: string): string | undefined => {
      if (entityId.startsWith('bv_')) return boardVertexPointMap.get(entityId);
      return holePointMap.get(entityId);
    };

    /** Look up a GCS line-id for an entity that may be a trace, board edge, OR construction line. */
    const resolveLines = (entityId: string): string[] | undefined => {
      if (entityId.startsWith('be_')) {
        const l = boardEdgeLineMap.get(entityId);
        return l ? [l] : undefined;
      }
      if (entityId.startsWith('cl_')) {
        const l = constrLineMap.get(entityId);
        return l ? [l] : undefined;
      }
      return traceLineMap.get(entityId);
    };

    switch (c.type) {
      case 'distance': {
        if (e.length < 2) break;
        const val = resolveParamValue(c.value, project.parameters);
        if (val === null) break;
        // hole/board-vertex → board-edge or construction-line: use p2l_distance
        if (e[0].startsWith('be_') || e[1].startsWith('be_') || e[0].startsWith('cl_') || e[1].startsWith('cl_')) {
          const isLineFirst = e[0].startsWith('be_') || e[0].startsWith('cl_');
          const [pointEntityId, lineEntityId] = isLineFirst ? [e[1], e[0]] : [e[0], e[1]];
          const p = resolvePoint(pointEntityId);
          const l = boardEdgeLineMap.get(lineEntityId) ?? constrLineMap.get(lineEntityId);
          if (!p || !l) break;
          primitives.push({ id: gcsId, type: 'p2l_distance', p_id: p, l_id: l, distance: val } satisfies P2LDistance);
        } else {
          const p1 = resolvePoint(e[0]);
          const p2 = resolvePoint(e[1]);
          if (!p1 || !p2) break;
          primitives.push({ id: gcsId, type: 'p2p_distance', p1_id: p1, p2_id: p2, distance: val } satisfies P2PDistance);
        }
        break;
      }
      case 'coincident': {
        if (e.length < 2) break;
        // hole → board-edge or construction-line: use point_on_line_pl
        if (e[0].startsWith('be_') || e[1].startsWith('be_') || e[0].startsWith('cl_') || e[1].startsWith('cl_')) {
          const isLineFirst = e[0].startsWith('be_') || e[0].startsWith('cl_');
          const [pointEntityId, lineEntityId] = isLineFirst ? [e[1], e[0]] : [e[0], e[1]];
          const p = resolvePoint(pointEntityId);
          const l = boardEdgeLineMap.get(lineEntityId) ?? constrLineMap.get(lineEntityId);
          if (!p || !l) break;
          primitives.push({ id: gcsId, type: 'point_on_line_pl', p_id: p, l_id: l } satisfies PointOnLine_PL);
        } else {
          const p1 = resolvePoint(e[0]);
          const p2 = resolvePoint(e[1]);
          if (!p1 || !p2) break;
          primitives.push({ id: gcsId, type: 'p2p_coincident', p1_id: p1, p2_id: p2 } satisfies P2PCoincident);
        }
        break;
      }
      case 'horizontal': {
        if (e.length < 1) break;
        const lines = resolveLines(e[0]);
        if (!lines?.length) break;
        for (let i = 0; i < lines.length; i++) {
          primitives.push({ id: `${gcsId}_s${i}`, type: 'horizontal_l', l_id: lines[i] } satisfies Horizontal_L);
        }
        break;
      }
      case 'vertical': {
        if (e.length < 1) break;
        const lines = resolveLines(e[0]);
        if (!lines?.length) break;
        for (let i = 0; i < lines.length; i++) {
          primitives.push({ id: `${gcsId}_s${i}`, type: 'vertical_l', l_id: lines[i] } satisfies Vertical_L);
        }
        break;
      }
      case 'perpendicular': {
        if (e.length < 2) break;
        const lines1 = resolveLines(e[0]);
        const lines2 = resolveLines(e[1]);
        if (!lines1?.length || !lines2?.length) break;
        primitives.push({ id: gcsId, type: 'perpendicular_ll', l1_id: lines1[0], l2_id: lines2[0] } satisfies Perpendicular_LL);
        break;
      }
      case 'angle': {
        if (e.length < 2) break;
        const val = resolveParamValue(c.value, project.parameters);
        if (val === null) break;
        const lines1 = resolveLines(e[0]);
        const lines2 = resolveLines(e[1]);
        if (!lines1?.length || !lines2?.length) break;
        primitives.push({
          id: gcsId,
          type: 'l2l_angle_ll',
          l1_id: lines1[0],
          l2_id: lines2[0],
          angle: (val * Math.PI) / 180,
        } satisfies L2LAngle_LL);
        break;
      }
      case 'equal':
        // Scope: Week 4
        break;
    }
  }

  return { primitives, readback, traceLineMap, holePointMap, boardVertexPointMap, boardEdgeLineMap, constrLineMap };
}
