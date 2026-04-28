// Runs the planegcs solver on the project and returns an updated project
// with solved coordinates, plus conflict information.

import { SolveStatus } from '@salusoft89/planegcs';
import type { Project, Hole, TraceNode } from '../model/types';
import { getGcs } from './gcs';
import { translateProject } from './translate';

export type SolveResult = {
  ok: boolean;
  statusStr: string;
  /** Deep-cloned project with solved geometry written back. */
  project: Project;
  /** Model constraint IDs that are conflicting (empty on success). */
  conflictingConstraintIds: string[];
};

/**
 * Runs planegcs on `project`. Returns an updated project with solved
 * positions. Never throws — errors are reported in the result.
 */
export async function solveProject(project: Project): Promise<SolveResult> {
  // Nothing to solve if there are no constraints
  if (project.constraints.length === 0) {
    return { ok: true, statusStr: 'no constraints', project, conflictingConstraintIds: [] };
  }

  try {
    const gcs = await getGcs();
    gcs.clear_data();

    const { primitives, readback } = translateProject(project);
    gcs.push_primitives_and_params(primitives);

    const status = gcs.solve();
    const ok =
      status === SolveStatus.Success || status === SolveStatus.Converged;

    const statusStr =
      status === SolveStatus.Success
        ? 'Success'
        : status === SolveStatus.Converged
          ? 'Converged'
          : status === SolveStatus.Failed
            ? 'Failed (over/under-constrained)'
            : 'SuccessfulSolutionInvalid';

    // Read conflicting constraint IDs (strip our 'gcs_' prefix)
    let conflictingConstraintIds: string[] = [];
    if (!ok && gcs.has_gcs_conflicting_constraints()) {
      const raw = gcs.get_gcs_conflicting_constraints();
      conflictingConstraintIds = raw
        .filter((id) => id.startsWith('gcs_'))
        .map((id) => id.slice(4)); // remove 'gcs_'
    }

    if (!ok) {
      return { ok: false, statusStr, project, conflictingConstraintIds };
    }

    gcs.apply_solution();

    // Read back solved positions into a new deep-copied project
    const updatedProject = deepCloneProject(project);

    for (const [ptId, entry] of readback) {
      try {
        const solved = gcs.sketch_index.get_sketch_point(ptId);
        if (entry.kind === 'hole') {
          const hole = updatedProject.holes.find((h) => h.id === entry.holeId);
          if (hole) {
            hole.position = { x: solved.x, y: solved.y };
          }
        } else if (entry.kind === 'boardVertex') {
          // Write solved board vertex position back (only free vertices are in readback)
          if (updatedProject.board) {
            updatedProject.board.vertices[entry.vertexIndex] = { x: solved.x, y: solved.y };
          }
        } else {
          // traceNode
          const trace = updatedProject.traces.find((t) => t.id === entry.traceId);
          if (trace) {
            const node = trace.nodes[entry.nodeIndex];
            if (node && node.kind === 'point') {
              (node as Extract<TraceNode, { kind: 'point' }>).position = {
                x: solved.x,
                y: solved.y,
              };
            }
            // 'on_trace' nodes keep their t value; hole nodes delegate to hole
          }
        }
      } catch {
        // Primitive might not exist if it was skipped during translation (e.g., orphaned)
      }
    }

    return { ok: true, statusStr, project: updatedProject, conflictingConstraintIds: [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, statusStr: `Error: ${msg}`, project, conflictingConstraintIds: [] };
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function deepCloneProject(p: Project): Project {
  return {
    board: p.board
      ? { id: p.board.id, vertices: p.board.vertices.map((v) => ({ ...v })) }
      : null,
    holes: p.holes.map(cloneHole),
    traces: p.traces.map((t) => ({
      id: t.id,
      width: t.width,
      nodes: t.nodes.map(cloneNode),
    })),
    constraints: p.constraints.map((c) => ({ ...c, entityIds: [...c.entityIds] })),
    parameters: p.parameters.map((param) => ({ ...param })),
    constructionLines: p.constructionLines.map((cl) => ({ ...cl, start: { ...cl.start }, end: { ...cl.end } })),
  };
}

function cloneHole(h: Hole): Hole {
  return { ...h, position: { ...h.position } };
}

function cloneNode(n: TraceNode): TraceNode {
  if (n.kind === 'point') return { kind: 'point', position: { ...n.position } };
  if (n.kind === 'hole') return { kind: 'hole', holeId: n.holeId };
  return { kind: 'on_trace', traceId: n.traceId, t: n.t };
}
