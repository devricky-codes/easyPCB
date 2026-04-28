# EasyPCB — Progress Log

## Week 1 — DONE

### Scaffold
- Vite 5 + React 18 + TypeScript 5.6 + Tailwind 3.4
- Konva 9 + react-konva 18 (canvas)
- Zustand 5 (state)
- @salusoft89/planegcs 1.1.7 (constraint solver, FreeCAD WASM)
- `npm run dev` / `npm run build` / `npm run typecheck` all green
- WASM bundles to `dist/assets/planegcs-*.wasm` (508 kB)

### Data model
- `Project = { board, holes, traces, constraints, parameters }`
- All coordinates in mm, Y-down (will flip on Gerber export)
- Tool union: `select | board | hole`
- Selection union: `none | hole | board`
- Files: [src/model/types.ts](src/model/types.ts), [src/model/store.ts](src/model/store.ts)

### Canvas
- Grid layer with minor (mm) + major (10 mm) lines + origin axes ([src/canvas/GridLayer.tsx](src/canvas/GridLayer.tsx))
- Cursor-anchored zoom (model point under cursor stays put) ([src/canvas/CanvasRoot.tsx](src/canvas/CanvasRoot.tsx))
- Wheel zoom, middle/right-drag pan
- Live cursor mm + zoom readout
- Snap to grid (toggle + selectable step: 0.1 / 0.25 / 0.5 / 1 / 2.54 / 5 / 10 mm)

### Board outline
- B-key or toolbar → click vertices → click first vertex (or Enter) to close → Esc cancels
- Rubber-band line from last vertex to cursor; first vertex highlighted
- Files: [src/canvas/BoardLayer.tsx](src/canvas/BoardLayer.tsx)

### Holes
- H-key or toolbar → click to place → sidebar shows x / y / diameter / delete
- Hole click in any tool selects it (no silent stacking)
- Click cycling on overlapping holes (click again → next)
- Files: [src/canvas/HoleLayer.tsx](src/canvas/HoleLayer.tsx)

### Solver
- planegcs WASM loaded via Vite `?url` import
- Singleton lazy-init in `getGcs()`
- `verifyPlanegcs()` runs a 2-point distance test (anchor + 10 mm constraint)
- "verify planegcs" button in sidebar — confirmed PASS in browser
- Files: [src/solver/gcs.ts](src/solver/gcs.ts)

### UI
- Toolbar: tool buttons, draft-board controls, snap toggle, grid step
- Sidebar: tool hint, selection editor, project counters, solver verify panel
- Status bar: current tool + keybind reference
- Keys: V / B / H, Esc, Enter
- Files: [src/ui/Toolbar.tsx](src/ui/Toolbar.tsx), [src/ui/Sidebar.tsx](src/ui/Sidebar.tsx)

---

## Bugs fixed during Week 1

### 1. planegcs version typo
package.json had `^0.6.0`, no such version. Latest on npm is `1.1.7`. Fixed.

### 2. tsconfig project-reference / `--noEmit` clash
`tsc -b` complained the referenced node-config disabled emit. Simplified to a single `tsconfig.json` covering both `src/` and `vite.config.ts` and dropped `tsconfig.node.json`.

### 3. Hole click events missed sparse, non-overlapping holes (KEY FIX)
Symptom: with per-`Circle` `onClick` listeners — even with explicit `hitFunc` and a generous hit halo — only some holes registered clicks. Console proved the handler simply did not fire for most circles.
Root cause appears to be Konva's hit-canvas rasterization of small circles: at small pixel radii the per-shape hit canvas misses sub-pixel click positions even when `hitFunc` is set. Holes were sparse (not overlapping), so it was not a z-order issue.
Fix: dropped per-`Circle` event handlers, made `HoleLayer` `listening={false}` (pure visual). All hole hit-testing is now done in `CanvasRoot.onStageClick` with explicit distance math against `project.holes`. Click-cycling falls out for free — when multiple holes are within click halo, repeat clicks cycle through them.
Halo: `max(visualRadius, 2) + 6` px around each hole.
File: [src/canvas/CanvasRoot.tsx:13-29](src/canvas/CanvasRoot.tsx#L13-L29) (`findHolesAt`), [src/canvas/CanvasRoot.tsx:onStageClick](src/canvas/CanvasRoot.tsx)
Confirmed working by user.

### 4. Stage click no longer stacks holes on shape clicks
Tightened `onStageClick` to early-return when `e.target !== stage` was the original guard; now superseded by the distance-check approach above which handles both selection and stack-prevention in hole tool.

---

## MCP servers — not yet bridged

`agent-kb` and `flowmap` are configured in `.vscode/mcp.json` (and `mcp.json`) but their tool schemas (`search_kb`, `flowmap_analyze_workspace`, etc.) have not appeared in the deferred-tool list this session. ToolSearch for "flowmap" / "agent-kb" returns nothing relevant. Likely needs Claude Code restart so the MCP layer picks up the servers.

When they appear, do per Week 1 close-out:
- `flowmap_analyze_workspace` — check orphans, cycles, chokepoints introduced
- `flowmap_find_duplicates` — catch any silent copy-paste sprawl
- For Week 1, the bug above should be `log_problem` + `log_solution(worked=true)` once user confirms again — already user-confirmed. Will log when KB tool is reachable.

---

## Up next — Week 4

- [ ] Dimension annotations on canvas (arrows + labels for driving constraints)
- [ ] Gerber / drill-file export
- [ ] Footprint library (reusable pad patterns)
- [ ] Named parameters panel (bound to constraint values by name)

---

## Week 3 — DONE

### Constraint solver integration

#### Data model
- `Constraint = { id, type, entityIds[], value?, driving }` already in `types.ts`
- `Parameter = { name, value }` for named driving parameters
- `ConstraintType`: `distance | angle | horizontal | vertical | perpendicular | coincident | fixed | equal`
- `Project.constraints[]` + `Project.parameters[]` fully wired

#### solver/translate.ts (new)
- Translates `Project` holes + traces to planegcs `SketchPoint` + `SketchLine` primitives
- Holes → `SketchPoint` (fixed=true if a `fixed` constraint exists on that hole)
- Trace nodes → `SketchPoint`; each consecutive pair → `SketchLine`
- `on_trace` nodes → `point_on_line_pl` constraint derived from parent trace's closest segment
- Model constraints → GCS constraints:
  - `distance` → `p2p_distance` (between two hole points)
  - `coincident` → `p2p_coincident`
  - `horizontal` → `horizontal_l` per trace segment
  - `vertical` → `vertical_l` per trace segment
  - `perpendicular` → `perpendicular_ll` (first segment of each trace)
  - `angle` → `l2l_angle_ll` (value in degrees, converted to radians)
  - `fixed` → expressed via `SketchPoint.fixed = true` (no separate GCS primitive)
- Returns `{ primitives, readback, traceLineMap, holePointMap }` for solve-back
- File: [src/solver/translate.ts](src/solver/translate.ts)

#### solver/solve.ts (new)
- `solveProject(project)` async — loads planegcs WASM, translates, solves, reads back
- Returns `{ ok, statusStr, project, conflictingConstraintIds }`
- On failure: returns original project unchanged + conflicting IDs for UI highlighting
- Deep-clones project before writing back solved positions (no mutation of old state)
- File: [src/solver/solve.ts](src/solver/solve.ts)

#### Store additions
- New state: `solveStatus: { ok, msg } | null`, `autoSolve: boolean`, `conflictingIds: string[]`
- New actions: `addConstraint`, `deleteConstraint`, `addParameter`, `updateParameter`, `deleteParameter`, `runSolve`, `toggleAutoSolve`
- Auto-solve fires automatically after `addConstraint`, `deleteConstraint`, `updateParameter` when `autoSolve=true`
- File: [src/model/store.ts](src/model/store.ts)

#### Constraint UI (Sidebar)
- "Constraints" section: lists all constraints with type, value, entity short-IDs; conflicting constraints highlighted in red
- Add constraint form:
  - Type picker (all 8 types)
  - Entity 1: "pin" button captures current selection; Entity 2: always current selection
  - Single-entity types (horizontal, vertical, fixed) only show "entity" (current selection)
  - Value input shown for `distance` (mm) and `angle` (degrees)
  - "add constraint" button — disabled until entities + value are valid
- "Solver" section:
  - Auto-solve checkbox toggle
  - "solve now" button (runs solver, shows running state)
  - Solve status badge (green = ok, red = failed with reason)
  - "verify planegcs wasm" button (retained from Week 2)
- File: [src/ui/Sidebar.tsx](src/ui/Sidebar.tsx)

### MCP health check (Week 3 close)
- `flowmap_find_cycles`: 0 cycles
- `flowmap_find_duplicates`: 0 duplicate clusters
- `tsc --noEmit`: exit 0 (no errors)

---

## Week 2 — DONE

### Trace drawing (T key / Trace button)
- Click to place nodes; each click appends a `TraceNode` to `draftTrace`
- **Snap priority**: hole centre (12 px halo) > T-junction on existing trace (1.5 mm) > grid
- Right-click or Enter to **finish** (commit ≥ 2 nodes); Esc cancels and returns to Select
- Toolbar shows live node count + Finish / Cancel buttons during draft
- File: [src/canvas/TraceLayer.tsx](src/canvas/TraceLayer.tsx), [src/canvas/CanvasRoot.tsx](src/canvas/CanvasRoot.tsx)

### T-junction (on_trace nodes)
- When placing a trace node near an existing committed trace, a `{ kind: 'on_trace', traceId, t }` node is created
- `t` is arc-length parameterised (0 = trace start, 1 = trace end)
- Helper: `findTraceAt()` in [src/model/traceUtils.ts](src/model/traceUtils.ts)

### Select / move / delete
- Select tool: click hole to select (click-cycle for overlaps), click trace segment to select it
- **Drag-to-move**: in select tool, drag a selected hole to reposition it; history snapshot taken on drag-start so undo reverts the full move
- **Delete**: Delete / Backspace key deletes the selected hole or trace; also in sidebar via button
- Trace selection shows id, node count, width editor in sidebar

### Undo / Redo
- Full project snapshot array (`history[]` / `future[]`) with cap of 64 entries
- Every commit action (`addHole`, `deleteHole`, `closeBoard`, `finishTrace`, `updateTrace`, `deleteTrace`) pushes a snapshot before mutating
- Drag-to-move pushes one snapshot at drag-start (not per-frame)
- Ctrl+Z / Ctrl+Y (also Ctrl+Shift+Z) wired globally in [src/App.tsx](src/App.tsx)
- Undo/Redo buttons in toolbar with disabled state when stack empty

### Trace hit-testing (select tool)
- After no hole hit: check all trace segments with `halfWidth + halo` tolerance in mm space
- Implemented in `findTraceAtPx()` inside CanvasRoot
- Same "no per-shape Konva listener" pattern as holes (avoids the Week 1 hit-canvas bug)

### traceUtils.ts (new model helper)
- `resolveNodePosition`, `resolveTrace` — model→Point resolution used by TraceLayer and CanvasRoot
- `interpolateAlongPolyline`, `closestOnPolyline` — arc-length maths
- `findTraceAt` — T-junction snap helper
- File: [src/model/traceUtils.ts](src/model/traceUtils.ts)

### Store updates
- New state: `draftTrace`, `history`, `future`
- New actions: `startTrace`, `pushTraceNode`, `finishTrace`, `cancelTrace`, `updateTrace`, `deleteTrace`, `pushHistory`, `undo`, `redo`
- `updateHole` is now a "live" write (no history push) so drag is smooth; callers push history explicitly
- File: [src/model/store.ts](src/model/store.ts)

### MCP health check (Week 2 close)
- `agent-kb` KB: logged Week 1 Konva hit-canvas bug (problem + solution, `worked=true`)
- `flowmap_find_duplicates`: 0 duplicate clusters
- `flowmap_find_cycles`: 0 cycles — call graph remains acyclic

---

