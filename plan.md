# PCB Layout Tool — Project Plan

## What We Are Building

A constraint-driven PCB layout tool for designing bare PCBs — boards with only holes and traces,
no components. The tool feels like a CAD sketcher (Fusion 360 / FreeCAD Sketcher) rather than a
traditional PCB EDA tool. Every measurement is a named, editable constraint. The board can be any
polygon shape. Traces can connect to other traces mid-wire (T-junctions). Output is Gerber files
accepted by any PCB vendor (JLCPCB, PCBWay, OSH Park, etc.).

---

## Core Concepts

| Entity | Description |
|---|---|
| **Board** | A closed polygon defining the PCB outline. Any shape. |
| **Hole** | A point on the board with a diameter. Where components get soldered. Plated Through-Hole (PTH). |
| **Trace** | A polyline with a thickness connecting hole-to-hole or wire-to-wire. |
| **Node** | Any connectable point — hole center, trace endpoint, or T-junction on a trace. |
| **Constraint** | A named rule between entities — distance, angle, perpendicular, horizontal, equal, etc. |
| **Parameter** | A named number that can be referenced by multiple constraints. Change once, updates everywhere. |

---

## Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Constraint Solver | `@salusoft89/planegcs` (npm) | FreeCAD's battle-tested solver compiled to WebAssembly. Handles all 2D geometric constraints. No need to write math from scratch. |
| UI Framework | React + TypeScript | Component-based UI for panels, toolbars, modals. |
| Canvas Renderer | Konva.js | 2D canvas library with good interaction model — drag, click, zoom, pan. |
| Build Tool | Vite | Fast dev server, handles `.wasm` file imports cleanly with `?url` import. |
| Styling | Tailwind CSS | Utility-first, fast to build dark-themed CAD-style UI. |
| File I/O | Browser File API | Save/load project as JSON. Export Gerber as zip. |
| Packaging (later) | Electron | Wrap into desktop app with native file system access. |

---

## Architecture — Three Layers

```
┌─────────────────────────────────────────────────────┐
│                     UI Layer                        │
│  React components — toolbar, panels, modals         │
│  Konva canvas — rendering, mouse interaction        │
└────────────────────┬────────────────────────────────┘
                     │ user actions
┌────────────────────▼────────────────────────────────┐
│                  Data Model Layer                   │
│  Source of truth — holes, traces, board, constraints│
│  Translates entities → planegcs primitives          │
│  Calls solver, reads back updated positions         │
└────────────────────┬────────────────────────────────┘
                     │ solved coordinates
┌────────────────────▼────────────────────────────────┐
│               Export / Solver Layer                 │
│  planegcs WASM — constraint solving                 │
│  Gerber writer — drill, copper, outline files       │
└─────────────────────────────────────────────────────┘
```

### Data Flow (every interaction)

```
User action on canvas
        ↓
Update data model (add/move/constrain entity)
        ↓
Translate data model → planegcs JSON primitives
        ↓
planegcs.solve()
        ↓
Read back updated coordinates into data model
        ↓
Re-render Konva canvas
```

---

## Constraint Types Supported

All sourced from `planegcs` — no custom math needed.

| Constraint | Planegcs Type | Use Case |
|---|---|---|
| Distance hole ↔ hole | `p2p_distance` | Spacing between two holes |
| Distance hole ↔ board edge | `p2l_distance` | Edge clearance |
| Distance trace ↔ hole | `p2l_distance` | Trace clearance |
| Horizontal lock | `horizontal` | Force trace to be horizontal |
| Vertical lock | `vertical` | Force trace to be vertical |
| Angle between traces | `p2p_angle` | Angular constraint |
| Perpendicular traces | `perpendicular` | 90° between two traces |
| Equal spacing | `equal` | Uniform hole grid |
| Coincident (snap) | `p2p_coincident` | Snap trace end to hole center |
| Point on trace | `point_on_line` | T-junction — trace connects mid-wire |
| Fixed position | `fixed` flag on point | Lock a hole/node to absolute coordinates |
| Hole diameter | stored as parameter | Named, editable |
| Trace width | stored as parameter | Named, editable |

---

## Feature List

### Phase 1 — Core Drawing
- [ ] Canvas with grid (1mm spacing), zoom, pan
- [ ] Snap to grid (configurable grid size)
- [ ] Draw board outline — click to place polygon vertices, click first point to close
- [ ] Place holes — click on canvas, set diameter in sidebar
- [ ] Draw traces — click start point (hole or existing trace), click end point
- [ ] T-junction — trace can connect to midpoint of another trace
- [ ] Select, move, delete entities
- [ ] Undo / Redo

### Phase 2 — Constraints & Dimensions
- [ ] Select two entities → add constraint from panel
- [ ] Dimension annotations drawn on canvas (arrows + numbers, CAD style)
- [ ] Named parameters — define `hole_spacing = 2.54mm`, reference in multiple constraints
- [ ] Edit constraint value → geometry updates automatically
- [ ] Over-constraint detection and warning (planegcs returns this)
- [ ] Degrees of freedom indicator

### Phase 3 — Measurements & Display
- [ ] Real-world unit display (mm) — all coordinates in mm internally
- [ ] Ruler on canvas edges
- [ ] Hover tooltip showing coordinates of cursor in mm
- [ ] Distance measurement tool (click two points, shows distance)
- [ ] Highlight conflicting constraints in red

### Phase 4 — Export
- [ ] Export Gerber zip containing:
  - `board.GTL` — top copper layer (traces)
  - `board.GBL` — bottom copper layer (empty for single-layer)
  - `board.DRL` — drill file (hole positions + diameters)
  - `board.GKO` — board outline
- [ ] Export DXF (board outline, for reference)
- [ ] Save project as JSON
- [ ] Load project from JSON

### Phase 5 — Polish
- [ ] Dark theme CAD-style UI
- [ ] Keyboard shortcuts (D = distance constraint, H = horizontal, V = vertical, etc.)
- [ ] Snap to hole center when drawing traces
- [ ] Snap to trace endpoint
- [ ] Board outline area and dimensions displayed
- [ ] Electron packaging for desktop

---

## Gerber File Format (what we write)

Gerber is a plain text format. Each file is ~100–200 lines for a simple board.

### Drill file (.DRL) example
```
M48
METRIC,LZ
T1C0.8    ; Tool 1 = 0.8mm diameter
T2C1.0    ; Tool 2 = 1.0mm diameter
%
T1
X10.000Y10.000    ; hole at (10, 10)
X20.000Y10.000    ; hole at (20, 10)
T2
X15.000Y20.000    ; hole at (15, 20)
M30
```

### Copper layer (.GTL) example
```
%FSLAX46Y46*%
%MOMM*%
%LPD*%
D10*            ; select aperture (trace width)
X10000Y10000D02*  ; move to start
X20000Y10000D01*  ; draw to end
M02*
```

The Gerber exporter is approximately 300–400 lines of TypeScript.

---

## Data Model (TypeScript types)

```typescript
type Point = { x: number; y: number };  // always in mm

type Board = {
  id: string;
  vertices: Point[];  // polygon outline
};

type Hole = {
  id: string;
  position: Point;
  diameter: number;   // mm
  label?: string;
};

type TraceNode =
  | { kind: 'hole'; holeId: string }
  | { kind: 'point'; position: Point }
  | { kind: 'on_trace'; traceId: string; t: number };  // t = 0..1 along trace

type Trace = {
  id: string;
  nodes: TraceNode[];   // polyline, min 2 nodes
  width: number;        // mm
};

type ConstraintType =
  | 'distance'
  | 'angle'
  | 'horizontal'
  | 'vertical'
  | 'perpendicular'
  | 'equal'
  | 'coincident'
  | 'fixed';

type Constraint = {
  id: string;
  type: ConstraintType;
  entityIds: string[];   // which holes/traces/nodes this applies to
  value?: number | string;  // number or named parameter reference
  driving: boolean;
};

type Parameter = {
  name: string;   // e.g. "hole_spacing"
  value: number;  // mm or degrees
};

type Project = {
  board: Board;
  holes: Hole[];
  traces: Trace[];
  constraints: Constraint[];
  parameters: Parameter[];
};
```

---

## planegcs Integration

### Translating our model to planegcs primitives

```typescript
// A hole becomes a fixed or free point
{ id: hole.id, type: 'point', x: hole.position.x, y: hole.position.y, fixed: false }

// A trace segment becomes a line between two points
{ id: `${trace.id}_p1`, type: 'point', x: ..., y: ..., fixed: false }
{ id: `${trace.id}_p2`, type: 'point', x: ..., y: ..., fixed: false }
{ id: `${trace.id}_line`, type: 'line', p1_id: `${trace.id}_p1`, p2_id: `${trace.id}_p2` }

// A distance constraint between two holes
{ id: constraint.id, type: 'p2p_distance', p1_id: hole1.id, p2_id: hole2.id, distance: 10 }

// A T-junction uses point_on_line
{ id: junction.id, type: 'point_on_line', p_id: nodePoint.id, l_id: traceLineId }
```

### Solve cycle

```typescript
function solve(project: Project): Project {
  const primitives = translateToPrimitives(project);
  gcs_wrapper.clear();
  gcs_wrapper.push_primitives_and_params(primitives);
  const result = gcs_wrapper.solve();
  if (result === SolveResult.Success) {
    const solved = gcs_wrapper.sketch_index.get_primitives();
    return applyBackToModel(project, solved);
  } else {
    // highlight conflicting constraints
    return markConflicts(project, gcs_wrapper.get_conflicting());
  }
}
```

---

## Build Order

### Week 1
1. Project setup — Vite + React + TypeScript + Konva + planegcs
2. Verify planegcs loads and solves a simple example in browser
3. Board outline drawing (click polygon, close shape)
4. Hole placement (click to place, set diameter)
5. Grid, snap to grid, zoom, pan

### Week 2
6. Trace drawing (click start, click end, polyline support)
7. T-junction (click on existing trace to start/end a new trace)
8. Select, move, delete
9. Undo/Redo (command pattern)

### Week 3
10. Constraint UI — select entities, pick constraint type, type value
11. Connect constraints to planegcs solver
12. Dimension annotations on canvas (arrows + labels)
13. Named parameters panel

### Week 4
14. Gerber exporter (drill + copper + outline)
15. Save / Load project JSON
16. Over-constraint warnings
17. UI polish — dark theme, keyboard shortcuts, snapping feedback

---

## File / Folder Structure

```
pcb-tool/
├── src/
│   ├── canvas/
│   │   ├── BoardLayer.tsx       # draws board outline
│   │   ├── HoleLayer.tsx        # draws holes
│   │   ├── TraceLayer.tsx       # draws traces
│   │   ├── DimensionLayer.tsx   # draws constraint annotations
│   │   └── CanvasRoot.tsx       # Konva Stage, zoom/pan
│   ├── solver/
│   │   ├── translate.ts         # project → planegcs primitives
│   │   ├── solve.ts             # run solver, read back results
│   │   └── gcs.ts               # planegcs init and singleton
│   ├── model/
│   │   ├── types.ts             # all TypeScript types
│   │   ├── store.ts             # app state (Zustand or useReducer)
│   │   └── history.ts           # undo/redo
│   ├── export/
│   │   ├── gerber.ts            # Gerber file writer
│   │   ├── drill.ts             # drill file writer
│   │   └── zip.ts               # bundle into downloadable zip
│   ├── ui/
│   │   ├── Toolbar.tsx          # tool selection (hole, trace, constraint, select)
│   │   ├── ConstraintPanel.tsx  # add/edit constraints
│   │   ├── ParameterPanel.tsx   # named parameters
│   │   └── ExportPanel.tsx      # export buttons
│   └── main.tsx
├── public/
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Known Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| planegcs solver fails to converge on complex sketches | Medium | Show error, allow user to remove last constraint. Provide DogLeg / LM / BFGS algorithm toggle. |
| Some planegcs constraints broken in non-driving mode | Low | We only use driving constraints. Noted in their README. |
| Gerber files rejected by vendor | Low | Test against JLCPCB's Gerber checker tool before launch. |
| Canvas performance on large boards | Low | Konva handles hundreds of shapes fine. Only re-render changed layers. |
| T-junction constraint gets over-constrained easily | Medium | Visual DOF indicator warns user before it happens. |

---

## What This Tool Is Not

- Not a schematic / netlist tool
- Not a component placement tool
- Not a DRC (design rule check) tool beyond basic constraint warnings
- Not a 3D viewer

It is a **bare PCB geometry tool**. Holes, traces, constraints, Gerber. Nothing else.

---

## Vendor Compatibility

The exported Gerber zip will be accepted by:

| Vendor | Min order | Notes |
|---|---|---|
| JLCPCB | 5 boards from ~$2 | Most popular, fastest |
| PCBWay | 5 boards from ~$5 | Good quality |
| OSH Park | 3 boards, per-sq-inch pricing | US-based |
| Seeed Fusion | 5 boards from ~$5 | Good for Asia region |
