/**
 * EasyPCB — single-trace re-router  (feature: unentangle).
 *
 * Algorithm: Theta* (any-angle A*) on an adaptive-resolution occupancy grid.
 *
 *  1. Adaptive cell size  — cellMm scales up automatically so the full geometry
 *     bounding box always fits inside MAX_GRID cells, eliminating the
 *     "endpoints outside routable area" failure on large boards.
 *
 *  2. Theta* any-angle routing  — at each relaxation step the grandparent is
 *     propagated through a line-of-sight test, yielding natural straight
 *     segments instead of blocky 45°/90° grid artefacts.  No reducePath
 *     post-process is required.
 *
 *  3. Strict diagonal blocking  — a diagonal step is only legal when both
 *     flanking cardinal cells are free, preventing traces from squeezing
 *     through tight pad gaps.
 *
 *  4. Proportional terminal clearance  — the zone cleared around start/end
 *     cells is proportional to the trace half-width so large pads never
 *     trap the router at its own endpoints.
 *
 *  5. Diagnostic errors  — clearly reports why routing failed (blocked start,
 *     blocked end, fully enclosed, or simply no path exists).
 */

import type { Point, Project, Trace, TraceNode } from '../model/types';
import { resolveTrace } from '../model/traceUtils';

// ─── Tuneable constants ────────────────────────────────────────────────────────

/** Finest cell size (mm). Coarsened automatically when the route area is large. */
const BASE_CELL_MM = 0.2;
/** Extra clearance added around all obstacles beyond the routed trace's
 *  half-width.  0.15 mm gives one PCB manufacturing tolerance slot. */
const CLEARANCE_MM = 0.15;
/** Maximum grid dimension per axis (cells).
 *  Memory budget ≈ 3 × MAX_GRID² × 8 bytes (Float64) ≈ 6 MB at 512. */
const MAX_GRID = 512;
/** Grid padding on each side of the geometry bbox (cells, in adaptive units). */
const GRID_PAD_CELLS = 6;

// ─── Public types ──────────────────────────────────────────────────────────────

export type RouteResult =
  | { ok: true;  nodes: TraceNode[]; info: string }
  | { ok: false; error: string };

// ─── Public entry point ────────────────────────────────────────────────────────

export function routeTrace(trace: Trace, project: Project, gapMm = 0): RouteResult {

  // 1 ── Resolve endpoints ────────────────────────────────────────────────────
  const pts = resolveTrace(trace, project);
  if (pts.length < 2) {
    return {
      ok: false,
      error: `Cannot resolve trace endpoints — trace has ${trace.nodes.length} node(s) but needs at least 2 resolved positions.`,
    };
  }

  const start = pts[0];
  const end   = pts[pts.length - 1];

  // Trivial case — start and end are the same point.
  if (Math.hypot(end.x - start.x, end.y - start.y) < 1e-6) {
    return { ok: true, nodes: trace.nodes, info: 'Start and end are coincident — nothing to re-route.' };
  }

  // 2 ── Build obstacle grid ──────────────────────────────────────────────────
  const gridInfo = buildGrid(trace, project, start, end, gapMm);
  const { grid, originX, originY, cols, rows, cellMm } = gridInfo;

  // 3 ── Compute terminal cells ───────────────────────────────────────────────
  const startCell = mmToCell(start, originX, originY, cellMm);
  const endCell   = mmToCell(end,   originX, originY, cellMm);

  // Safety assertion — adaptive cellMm guarantees this; guard defensively.
  if (!inBounds(startCell, cols, rows)) {
    return {
      ok: false,
      error: `Start point (${fmt(start)}) is outside the ${cols}×${rows} routing grid at ${cellMm.toFixed(3)} mm/cell. This is a bug — please report it.`,
    };
  }
  if (!inBounds(endCell, cols, rows)) {
    return {
      ok: false,
      error: `End point (${fmt(end)}) is outside the ${cols}×${rows} routing grid at ${cellMm.toFixed(3)} mm/cell. This is a bug — please report it.`,
    };
  }

  // 4 ── Clear a walkable zone around each terminal ───────────────────────────
  const termClearR = Math.max(2, Math.ceil((trace.width / 2 + CLEARANCE_MM) / cellMm) + 1);
  clearZone(grid, cols, rows, startCell, termClearR);
  clearZone(grid, cols, rows, endCell,   termClearR);

  if (!hasFreeCellNear(grid, cols, rows, startCell, termClearR + 1)) {
    return {
      ok: false,
      error: `Start pad (${fmt(start)}) is completely surrounded by obstacles after clearing a ${termClearR}-cell zone. Other traces or pads may be too close.`,
    };
  }
  if (!hasFreeCellNear(grid, cols, rows, endCell, termClearR + 1)) {
    return {
      ok: false,
      error: `End pad (${fmt(end)}) is completely surrounded by obstacles after clearing a ${termClearR}-cell zone. Other traces or pads may be too close.`,
    };
  }

  // 5 ── Run Theta* ───────────────────────────────────────────────────────────
  const path = thetaStar(grid, cols, rows, startCell, endCell);

  if (!path) {
    const density = blockedFraction(grid);
    return {
      ok: false,
      error:
        `No valid path found from (${fmt(start)}) to (${fmt(end)}). ` +
        `Grid: ${cols}×${rows} at ${cellMm.toFixed(3)} mm/cell, obstacle fill: ${(density * 100).toFixed(1)}%. ` +
        `The route may be completely enclosed by obstacles.`,
    };
  }

  // 6 ── Convert grid path → mm waypoints ────────────────────────────────────
  const mmPts: Point[] = path.map((c) => cellToMm(c, originX, originY, cellMm));

  // 7 ── Rebuild TraceNode list ───────────────────────────────────────────────
  const firstNode = trace.nodes[0];
  const lastNode  = trace.nodes[trace.nodes.length - 1];

  const innerNodes: TraceNode[] = mmPts.slice(1, -1).map((p) => ({
    kind: 'point' as const,
    position: { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 },
  }));

  const newNodes: TraceNode[] = [
    firstNode,
    ...innerNodes,
    ...(mmPts.length >= 2 ? [lastNode] : []),
  ];

  const segs = newNodes.length - 1;
  const info = `Re-routed: ${segs} segment${segs !== 1 ? 's' : ''} at ${cellMm.toFixed(3)} mm/cell (${cols}×${rows} grid).`;
  return { ok: true, nodes: newNodes, info };
}

// ─── Grid construction ─────────────────────────────────────────────────────────

type GridInfo = {
  grid: Uint8Array;
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  cellMm: number;
};

function buildGrid(
  trace: Trace,
  project: Project,
  start: Point,
  end: Point,
  gapMm = 0,
): GridInfo {
  // Gather bounding box from all geometry.
  let minX = Math.min(start.x, end.x);
  let maxX = Math.max(start.x, end.x);
  let minY = Math.min(start.y, end.y);
  let maxY = Math.max(start.y, end.y);

  for (const h of project.holes) {
    const r = h.diameter / 2;
    minX = Math.min(minX, h.position.x - r);
    maxX = Math.max(maxX, h.position.x + r);
    minY = Math.min(minY, h.position.y - r);
    maxY = Math.max(maxY, h.position.y + r);
  }
  for (const t of project.traces) {
    const tPts = resolveTrace(t, project);
    for (const p of tPts) {
      minX = Math.min(minX, p.x - t.width / 2);
      maxX = Math.max(maxX, p.x + t.width / 2);
      minY = Math.min(minY, p.y - t.width / 2);
      maxY = Math.max(maxY, p.y + t.width / 2);
    }
  }

  // Adaptive cell size: scale BASE_CELL_MM up in integer multiples until the
  // entire bbox (including padding) fits within MAX_GRID cells per axis.
  const usable = MAX_GRID - GRID_PAD_CELLS * 2 - 2;
  const spanX  = maxX - minX || 0.01;
  const spanY  = maxY - minY || 0.01;
  const rawCells = Math.max(spanX, spanY) / BASE_CELL_MM;
  const scale  = Math.max(1, Math.ceil(rawCells / usable));
  const cellMm = BASE_CELL_MM * scale;

  const padMm   = GRID_PAD_CELLS * cellMm;
  const originX = minX - padMm;
  const originY = minY - padMm;

  const cols = Math.min(MAX_GRID, Math.ceil((maxX + padMm - originX) / cellMm) + 1);
  const rows = Math.min(MAX_GRID, Math.ceil((maxY + padMm - originY) / cellMm) + 1);

  const grid = new Uint8Array(cols * rows); // 0 = free, 1 = blocked

  const traceR = trace.width / 2 + CLEARANCE_MM + gapMm;

  // Terminal hole IDs — not treated as obstacles.
  const termHoles = new Set<string>();
  const n0 = trace.nodes[0];
  const nN = trace.nodes[trace.nodes.length - 1];
  if (n0?.kind === 'hole') termHoles.add(n0.holeId);
  if (nN?.kind === 'hole') termHoles.add(nN.holeId);

  // Rasterise holes.
  for (const h of project.holes) {
    if (termHoles.has(h.id)) continue;
    markCircle(grid, cols, rows, originX, originY, cellMm, h.position, h.diameter / 2 + traceR);
  }

  // Rasterise other traces as capsule obstacles.
  for (const t of project.traces) {
    if (t.id === trace.id) continue;
    const tPts = resolveTrace(t, project);
    const r = t.width / 2 + traceR;
    for (let i = 1; i < tPts.length; i++) {
      markSegment(grid, cols, rows, originX, originY, cellMm, tPts[i - 1], tPts[i], r);
    }
  }

  return { grid, originX, originY, cols, rows, cellMm };
}

// ─── Obstacle rasteriser ───────────────────────────────────────────────────────

function markCircle(
  grid: Uint8Array, cols: number, rows: number,
  ox: number, oy: number, cellMm: number,
  centre: Point, radius: number,
) {
  const cellR = Math.ceil(radius / cellMm);
  const cc    = Math.round((centre.x - ox) / cellMm);
  const cr    = Math.round((centre.y - oy) / cellMm);
  for (let dr = -cellR; dr <= cellR; dr++) {
    for (let dc = -cellR; dc <= cellR; dc++) {
      const gc = cc + dc, gr = cr + dr;
      if (gc < 0 || gc >= cols || gr < 0 || gr >= rows) continue;
      if (Math.hypot(ox + gc * cellMm - centre.x, oy + gr * cellMm - centre.y) <= radius) {
        grid[gr * cols + gc] = 1;
      }
    }
  }
}

function markSegment(
  grid: Uint8Array, cols: number, rows: number,
  ox: number, oy: number, cellMm: number,
  a: Point, b: Point, radius: number,
) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) { markCircle(grid, cols, rows, ox, oy, cellMm, a, radius); return; }
  const nx = dx / len, ny = dy / len;

  const minCX = Math.max(0,        Math.floor((Math.min(a.x, b.x) - ox - radius) / cellMm));
  const maxCX = Math.min(cols - 1, Math.ceil( (Math.max(a.x, b.x) - ox + radius) / cellMm));
  const minCY = Math.max(0,        Math.floor((Math.min(a.y, b.y) - oy - radius) / cellMm));
  const maxCY = Math.min(rows - 1, Math.ceil( (Math.max(a.y, b.y) - oy + radius) / cellMm));

  for (let gr = minCY; gr <= maxCY; gr++) {
    for (let gc = minCX; gc <= maxCX; gc++) {
      const wx = ox + gc * cellMm, wy = oy + gr * cellMm;
      const t  = Math.max(0, Math.min(len, (wx - a.x) * nx + (wy - a.y) * ny));
      if (Math.hypot(wx - (a.x + t * nx), wy - (a.y + t * ny)) <= radius) {
        grid[gr * cols + gc] = 1;
      }
    }
  }
}

// ─── Terminal zone helpers ─────────────────────────────────────────────────────

function clearZone(
  grid: Uint8Array, cols: number, rows: number,
  centre: Cell, radius: number,
) {
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const gc = centre.c + dc, gr = centre.r + dr;
      if (gc >= 0 && gc < cols && gr >= 0 && gr < rows) grid[gr * cols + gc] = 0;
    }
  }
}

function hasFreeCellNear(
  grid: Uint8Array, cols: number, rows: number,
  centre: Cell, radius: number,
): boolean {
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const gc = centre.c + dc, gr = centre.r + dr;
      if (gc >= 0 && gc < cols && gr >= 0 && gr < rows && grid[gr * cols + gc] === 0) return true;
    }
  }
  return false;
}

function blockedFraction(grid: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]) n++;
  return n / grid.length;
}

// ─── Theta* ────────────────────────────────────────────────────────────────────

type Cell = { r: number; c: number };

/**
 * 8-directional moves.  `diag: true` entries require both flanking cardinal
 * cells to be free so traces never cut corners through a narrow pad gap.
 */
const DIRS: ReadonlyArray<{ dc: number; dr: number; diag: boolean }> = [
  { dc:  0, dr:  1, diag: false },
  { dc:  0, dr: -1, diag: false },
  { dc:  1, dr:  0, diag: false },
  { dc: -1, dr:  0, diag: false },
  { dc:  1, dr:  1, diag: true  },
  { dc:  1, dr: -1, diag: true  },
  { dc: -1, dr:  1, diag: true  },
  { dc: -1, dr: -1, diag: true  },
];

/**
 * Theta* path search.
 *
 * Unlike plain A*, Theta* tests whether a neighbour can be reached directly
 * from the *grandparent* of the current cell (line-of-sight via supercover
 * Bresenham).  When it can, the grandparent becomes the neighbour's parent,
 * so the reconstructed path uses any angle — not just multiples of 45°.
 * This naturally minimises waypoints without a separate smoothing pass.
 */
function thetaStar(
  grid: Uint8Array,
  cols: number,
  rows: number,
  start: Cell,
  end: Cell,
): Cell[] | null {
  const total = cols * rows;
  const INF   = 1e18;

  const g   = new Float64Array(total).fill(INF);
  const f   = new Float64Array(total).fill(INF);
  // parent flat-key.  -1 = root (no parent), -2 = unvisited.
  const par = new Int32Array(total).fill(-2);
  const closed = new Uint8Array(total);

  // Euclidean heuristic (admissible for any-angle movement).
  const h = (c: number, r: number): number => Math.hypot(c - end.c, r - end.r);

  // ─ Binary min-heap (lazy-push variant: stale entries skipped via closed set) ─
  const heap: number[] = [];
  const heapPush = (k: number) => {
    heap.push(k);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[heap[p]] <= f[heap[i]]) break;
      const tmp = heap[p]; heap[p] = heap[i]; heap[i] = tmp;
      i = p;
    }
  };
  const heapPop = (): number => {
    const top  = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        let s = i;
        const l = 2 * i + 1, r = l + 1;
        if (l < heap.length && f[heap[l]] < f[heap[s]]) s = l;
        if (r < heap.length && f[heap[r]] < f[heap[s]]) s = r;
        if (s === i) break;
        const tmp = heap[s]; heap[s] = heap[i]; heap[i] = tmp;
        i = s;
      }
    }
    return top;
  };

  const sk = start.r * cols + start.c;
  const ek = end.r   * cols + end.c;

  g[sk] = 0;
  f[sk] = h(start.c, start.r);
  par[sk] = -1; // root
  heapPush(sk);

  while (heap.length > 0) {
    const curK = heapPop();
    if (closed[curK]) continue; // stale heap entry
    closed[curK] = 1;

    if (curK === ek) {
      // Reconstruct path by following parent links back to root.
      const path: Cell[] = [];
      let k: number = ek;
      while (k >= 0) {
        path.push({ c: k % cols, r: (k / cols) | 0 });
        k = par[k];
      }
      path.reverse();
      return path;
    }

    const curC = curK % cols;
    const curR = (curK / cols) | 0;

    // Grandparent for Theta* LOS propagation (-1 when curK is the start).
    const spK = par[curK];
    const spC = spK >= 0 ? spK % cols       : curC;
    const spR = spK >= 0 ? (spK / cols) | 0 : curR;

    for (const { dc, dr, diag } of DIRS) {
      const nc = curC + dc;
      const nr = curR + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const nk = nr * cols + nc;
      if (closed[nk] || grid[nk]) continue;

      // Block corner-cutting: both flanking cardinal cells must be free.
      if (diag && (grid[curR * cols + nc] || grid[nr * cols + curC])) continue;

      // ─ Theta* two-option relaxation ─────────────────────────────────────
      let bestG  = INF;
      let bestPK = curK;

      // Option A — route through grandparent if line-of-sight is clear.
      if (spK !== -1 && los(grid, cols, spC, spR, nc, nr)) {
        const gA = g[spK] + Math.hypot(nc - spC, nr - spR);
        bestG = gA; bestPK = spK;
      }

      // Option B — regular single-step update through current cell.
      const gB = g[curK] + Math.hypot(nc - curC, nr - curR);
      if (gB < bestG) { bestG = gB; bestPK = curK; }

      if (bestG < g[nk]) {
        g[nk]   = bestG;
        f[nk]   = bestG + h(nc, nr);
        par[nk] = bestPK;
        heapPush(nk);
      }
    }
  }

  return null;
}

/**
 * Grid-supercover line-of-sight (integer Bresenham supercover).
 *
 * Visits every grid cell whose interior the straight line passes through —
 * more conservative than centre-to-centre Bresenham — so traces can never
 * sneak through a one-cell-wide diagonal gap.
 */
function los(
  grid: Uint8Array, cols: number,
  x0: number, y0: number,
  x1: number, y1: number,
): boolean {
  const adx = Math.abs(x1 - x0);
  const ady = Math.abs(y1 - y0);
  const sx  = x1 > x0 ? 1 : -1;
  const sy  = y1 > y0 ? 1 : -1;
  let x = x0, y = y0;
  let err = adx - ady;
  let n   = 1 + adx + ady; // supercover step count

  for (; n > 0; n--) {
    if (grid[y * cols + x]) return false;
    if (err > 0)      { x += sx; err -= ady * 2; }
    else if (err < 0) { y += sy; err += adx * 2; }
    else {
      // Exact corner: step both and deduct the extra.
      x += sx; y += sy; err += (adx - ady) * 2; n--;
    }
  }
  return true;
}

// ─── Coordinate helpers ────────────────────────────────────────────────────────

function mmToCell(p: Point, ox: number, oy: number, cellMm: number): Cell {
  return {
    c: Math.round((p.x - ox) / cellMm),
    r: Math.round((p.y - oy) / cellMm),
  };
}

function cellToMm(cell: Cell, ox: number, oy: number, cellMm: number): Point {
  return { x: ox + cell.c * cellMm, y: oy + cell.r * cellMm };
}

function inBounds(cell: Cell, cols: number, rows: number): boolean {
  return cell.c >= 0 && cell.c < cols && cell.r >= 0 && cell.r < rows;
}

function fmt(p: Point): string {
  return `${p.x.toFixed(2)}, ${p.y.toFixed(2)} mm`;
}
