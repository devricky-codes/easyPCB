// Data model. All coordinates and sizes are in millimetres.
// Y axis points down in the model (matches screen). Gerber export flips Y.

export type Point = { x: number; y: number };

export type Board = {
  id: string;
  vertices: Point[]; // closed polygon; last vertex implicitly connects to first
};

/**
 * pad   — through-hole component pad (annular copper ring on top/bottom copper)
 * via   — via hole (small pad or no pad; connects copper layers)
 * mount — mechanical mounting hole (no copper pad)
 */
export type HoleKind = 'pad' | 'via' | 'mount';

export type Hole = {
  id: string;
  position: Point;
  diameter: number;
  kind: HoleKind;
  label?: string;
  /** Offset of the draggable label anchor from the hole centre (mm). Feature: labels. */
  labelOffset?: Point;
};

export type TraceNode =
  | { kind: 'hole'; holeId: string }
  | { kind: 'point'; position: Point }
  | { kind: 'on_trace'; traceId: string; t: number };

export type Trace = {
  id: string;
  nodes: TraceNode[];
  width: number;
  label?: string;
  /** Offset of the draggable label anchor from the trace midpoint (mm). Feature: labels. */
  labelOffset?: Point;
};

export type ConstraintType =
  | 'distance'
  | 'angle'
  | 'horizontal'
  | 'vertical'
  | 'perpendicular'
  | 'equal'
  | 'coincident'
  | 'fixed';

export type Constraint = {
  id: string;
  type: ConstraintType;
  entityIds: string[];
  value?: number | string;
  driving: boolean;
};

export type Parameter = {
  name: string;
  value: number;
};

/** A visual-only construction / guide line. Never exported to Gerber. */
export type ConstructionLine = {
  id: string;
  /** Start endpoint (mm). */
  start: Point;
  /** End endpoint (mm). The line will be drawn extended to infinity through both points. */
  end: Point;
  label?: string;
};

export type Project = {
  board: Board | null;
  holes: Hole[];
  traces: Trace[];
  constraints: Constraint[];
  parameters: Parameter[];
  constructionLines: ConstructionLine[];
};

export type Tool = 'select' | 'board' | 'hole' | 'trace' | 'measure' | 'constr' | 'chain';

export type Selection =
  | { kind: 'none' }
  | { kind: 'hole'; id: string }
  | { kind: 'trace'; id: string }
  | { kind: 'board' }
  | { kind: 'board-vertex'; vertexIndex: number }
  | { kind: 'board-edge'; edgeIndex: number }
  | { kind: 'constr-line'; id: string };
