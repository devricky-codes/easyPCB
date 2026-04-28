import { create } from 'zustand';
import type { Constraint, ConstructionLine, Hole, Parameter, Point, Project, Selection, Tool, Trace, TraceNode } from './types';
import {
  DEFAULT_HOLE_DIAMETER_MM,
  DEFAULT_TRACE_WIDTH_MM,
  INITIAL_PX_PER_MM,
  DEFAULT_GRID_MM,
} from '../constants';
import { solveProject } from '../solver/solve';

let nextId = 1;
const uid = (prefix: string) => `${prefix}_${nextId++}`;

type View = {
  pxPerMm: number;
  offsetX: number; // screen-space px
  offsetY: number;
};

type DraftBoard = { vertices: Point[] } | null;

/** Nodes accumulated while drawing a trace. Committed on Enter/finish. */
type DraftTrace = { nodes: TraceNode[]; width: number } | null;

const MAX_HISTORY = 64;

type SolveStatus = { ok: boolean; msg: string } | null;

type State = {
  project: Project;
  tool: Tool;
  selection: Selection;
  view: View;
  gridMm: number;
  snapToGrid: boolean;
  draftBoard: DraftBoard;
  draftTrace: DraftTrace;
  /** Undo stack — snapshots of project before each committed action. */
  history: Project[];
  /** Redo stack — snapshots of project before each undo. */
  future: Project[];
  /** Constraint IDs that the solver reported as conflicting. */
  conflictingIds: string[];
  /** Last solve status message. */
  solveStatus: SolveStatus;
  /** When true, solver runs automatically after constraint mutations. */
  autoSolve: boolean;
  /** Points placed by the measure tool: 2 = distance, 3 = angle at [1]. */
  measurePoints: Point[];
  /** Whether construction lines are visible. */
  showConstruction: boolean;
  /** First point of a construction line being drawn (before second click). */
  draftConstrStart: Point | null;
};

type Actions = {
  setTool: (t: Tool) => void;
  setSelection: (s: Selection) => void;
  setView: (v: Partial<View>) => void;
  setGridMm: (g: number) => void;
  toggleSnap: () => void;
  toggleAutoSolve: () => void;

  // undo / redo
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // board
  startBoard: () => void;
  pushBoardVertex: (p: Point) => void;
  closeBoard: () => void;
  cancelBoard: () => void;

  // hole
  addHole: (p: Point, diameter?: number, kind?: import('./types').HoleKind) => void;
  /** Live update during drag — does NOT push history. Call pushHistory() first. */
  updateHole: (id: string, patch: Partial<Hole>) => void;
  deleteHole: (id: string) => void;

  // trace drawing
  startTrace: () => void;
  pushTraceNode: (n: TraceNode) => void;
  finishTrace: () => void;
  cancelTrace: () => void;
  updateTrace: (id: string, patch: Partial<Trace>) => void;
  deleteTrace: (id: string) => void;

  // constraints
  addConstraint: (c: Omit<Constraint, 'id'>) => void;
  deleteConstraint: (id: string) => void;

  // parameters
  addParameter: (name: string, value: number) => void;
  updateParameter: (name: string, value: number) => void;
  deleteParameter: (name: string) => void;

  // solver
  runSolve: () => Promise<void>;

  // project lifecycle
  loadProject: (p: Project) => void;
  clearProject: () => void;

  // measure tool
  pushMeasurePoint: (p: Point) => void;
  clearMeasure: () => void;

  // construction lines
  toggleConstruction: () => void;
  setDraftConstrStart: (p: Point | null) => void;
  addConstructionLine: (start: Point, end: Point) => void;
  deleteConstructionLine: (id: string) => void;
};

export const useStore = create<State & Actions>((set, get) => ({
  project: {
    board: null,
    holes: [],
    traces: [],
    constraints: [],
    parameters: [],
    constructionLines: [],
  },
  tool: 'select',
  selection: { kind: 'none' },
  view: { pxPerMm: INITIAL_PX_PER_MM, offsetX: 0, offsetY: 0 },
  gridMm: DEFAULT_GRID_MM,
  snapToGrid: true,
  draftBoard: null,
  draftTrace: null,
  history: [],
  future: [],
  conflictingIds: [],
  solveStatus: null,
  autoSolve: true,
  measurePoints: [],
  showConstruction: true,
  draftConstrStart: null,

  // ---- view ----
  setTool: (t) =>
    set((s) => ({
      tool: t,
      draftBoard: t === 'board' ? { vertices: [] } : s.draftBoard,
      draftTrace: t === 'trace' ? s.draftTrace : null,
    })),
  setSelection: (s) => set({ selection: s }),
  setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
  setGridMm: (g) => set({ gridMm: g }),
  toggleSnap: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  toggleAutoSolve: () => set((s) => ({ autoSolve: !s.autoSolve })),

  // ---- history ----
  pushHistory: () =>
    set((s) => ({
      history: [...s.history.slice(-MAX_HISTORY + 1), s.project],
      future: [],
    })),
  undo: () => {
    const { history, project } = get();
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    set((s) => ({
      project: prev,
      history: s.history.slice(0, -1),
      future: [project, ...s.future.slice(0, MAX_HISTORY - 1)],
      selection: { kind: 'none' },
      draftTrace: null,
    }));
  },
  redo: () => {
    const { future, project } = get();
    if (future.length === 0) return;
    const next = future[0];
    set((s) => ({
      project: next,
      future: s.future.slice(1),
      history: [...s.history.slice(-MAX_HISTORY + 1), project],
      selection: { kind: 'none' },
    }));
  },

  // ---- board ----
  startBoard: () => set({ tool: 'board', draftBoard: { vertices: [] } }),
  pushBoardVertex: (p) =>
    set((s) => ({
      draftBoard: s.draftBoard
        ? { vertices: [...s.draftBoard.vertices, p] }
        : { vertices: [p] },
    })),
  closeBoard: () => {
    const { draftBoard } = get();
    if (!draftBoard || draftBoard.vertices.length < 3) return;
    get().pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        board: { id: uid('board'), vertices: draftBoard.vertices },
      },
      draftBoard: null,
      tool: 'select',
    }));
  },
  cancelBoard: () => set({ draftBoard: null, tool: 'select' }),

  // ---- holes ----
  addHole: (p, diameter = DEFAULT_HOLE_DIAMETER_MM, kind = 'pad') => {
    get().pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        holes: [...s.project.holes, { id: uid('hole'), position: p, diameter, kind }],
      },
    }));
  },
  updateHole: (holeId, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        holes: s.project.holes.map((h) => (h.id === holeId ? { ...h, ...patch } : h)),
      },
    })),
  deleteHole: (holeId) => {
    get().pushHistory();
    set((s) => ({
      project: { ...s.project, holes: s.project.holes.filter((h) => h.id !== holeId) },
      selection:
        s.selection.kind === 'hole' && s.selection.id === holeId
          ? { kind: 'none' }
          : s.selection,
    }));
  },

  // ---- traces ----
  startTrace: () =>
    set({ tool: 'trace', draftTrace: { nodes: [], width: DEFAULT_TRACE_WIDTH_MM } }),
  pushTraceNode: (n) =>
    set((s) => ({
      draftTrace: s.draftTrace
        ? { ...s.draftTrace, nodes: [...s.draftTrace.nodes, n] }
        : { nodes: [n], width: DEFAULT_TRACE_WIDTH_MM },
    })),
  finishTrace: () => {
    const { draftTrace } = get();
    if (!draftTrace || draftTrace.nodes.length < 2) return;
    get().pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        traces: [
          ...s.project.traces,
          { id: uid('trace'), nodes: draftTrace.nodes, width: draftTrace.width },
        ],
      },
      draftTrace: { nodes: [], width: draftTrace.width }, // ready for next trace
    }));
  },
  cancelTrace: () => set({ draftTrace: null, tool: 'select' }),
  updateTrace: (traceId, patch) => {
    get().pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        traces: s.project.traces.map((t) => (t.id === traceId ? { ...t, ...patch } : t)),
      },
    }));
  },
  deleteTrace: (traceId) => {
    get().pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        traces: s.project.traces.filter((t) => t.id !== traceId),
      },
      selection:
        s.selection.kind === 'trace' && s.selection.id === traceId
          ? { kind: 'none' }
          : s.selection,
    }));
  },

  // ---- constraints ----
  addConstraint: (cPartial) => {
    get().pushHistory();
    const c: Constraint = { id: uid('c'), ...cPartial, driving: cPartial.driving ?? true };
    set((s) => ({
      project: { ...s.project, constraints: [...s.project.constraints, c] },
      conflictingIds: [],
    }));
    if (get().autoSolve) void get().runSolve();
  },
  deleteConstraint: (cId) => {
    get().pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        constraints: s.project.constraints.filter((c) => c.id !== cId),
      },
      conflictingIds: s.conflictingIds.filter((id) => id !== cId),
    }));
    if (get().autoSolve) void get().runSolve();
  },

  // ---- parameters ----
  addParameter: (name, value) => {
    const existing = get().project.parameters.find((p) => p.name === name);
    if (existing) return; // name must be unique
    get().pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        parameters: [...s.project.parameters, { name, value } satisfies Parameter],
      },
    }));
  },
  updateParameter: (name, value) => {
    get().pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        parameters: s.project.parameters.map((p) => (p.name === name ? { name, value } : p)),
      },
    }));
    if (get().autoSolve) void get().runSolve();
  },
  deleteParameter: (name) => {
    get().pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        parameters: s.project.parameters.filter((p) => p.name !== name),
      },
    }));
  },

  // ---- solver ----
  runSolve: async () => {
    const { project } = get();
    const result = await solveProject(project);
    set({
      project: result.project,
      solveStatus: { ok: result.ok, msg: result.statusStr },
      conflictingIds: result.conflictingConstraintIds,
    });
  },

  // ---- project lifecycle ----
  loadProject: (p) => {
    set({
      project: { ...p, constructionLines: p.constructionLines ?? [] },
      history: [],
      future: [],
      selection: { kind: 'none' },
      draftBoard: null,
      draftTrace: null,
      measurePoints: [],
      draftConstrStart: null,
      conflictingIds: [],
      solveStatus: null,
      tool: 'select',
    });
  },
  clearProject: () => {
    set({
      project: { board: null, holes: [], traces: [], constraints: [], parameters: [], constructionLines: [] },
      history: [],
      future: [],
      selection: { kind: 'none' },
      draftBoard: null,
      draftTrace: null,
      measurePoints: [],
      draftConstrStart: null,
      conflictingIds: [],
      solveStatus: null,
      tool: 'select',
    });
  },

  // ---- measure tool ----
  pushMeasurePoint: (p) => {
    const pts = get().measurePoints;
    // 3 points already shown → restart on next click
    set({ measurePoints: pts.length >= 3 ? [p] : [...pts, p] });
  },
  clearMeasure: () => set({ measurePoints: [] }),

  // ---- construction lines ----
  toggleConstruction: () => set((s) => ({ showConstruction: !s.showConstruction })),
  setDraftConstrStart: (p) => set({ draftConstrStart: p }),
  addConstructionLine: (start, end) => {
    get().pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        constructionLines: [
          ...s.project.constructionLines,
          { id: uid('cl'), start, end } satisfies ConstructionLine,
        ],
      },
      draftConstrStart: null,
    }));
  },
  deleteConstructionLine: (id) => {
    get().pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        constructionLines: s.project.constructionLines.filter((l) => l.id !== id),
      },
    }));
  },
}));
