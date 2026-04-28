import { useState, useEffect } from 'react';
import { useStore } from '../model/store';
import { verifyPlanegcs } from '../solver/gcs';
import { DEFAULT_HOLE_DIAMETER_MM, FEATURES } from '../constants';
import type { ConstraintType, HoleKind, Project } from '../model/types';

function UnentanglePanel({ traceId }: { traceId: string }) {
  const unentangleTrace = useStore((s) => s.unentangleTrace);
  const [gapMm, setGapMm] = useState(0.15);
  return (
    <div className="space-y-1 border-t border-border pt-2 mt-1">
      <Field label="gap mm">
        <NumberInput
          value={gapMm}
          min={0.05}
          step={0.05}
          onChange={setGapMm}
        />
      </Field>
      <button
        onClick={() => void unentangleTrace(traceId, gapMm)}
        className="w-full px-2 py-1 rounded border border-border bg-bg hover:border-accent hover:text-accent text-xs"
      >
        un-entangle
      </button>
    </div>
  );
}

export function Sidebar() {
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const updateHole = useStore((s) => s.updateHole);
  const deleteHole = useStore((s) => s.deleteHole);
  const updateTrace = useStore((s) => s.updateTrace);
  const deleteTrace = useStore((s) => s.deleteTrace);
  // label offsets (feature: labels)
  const setHoleLabelOffset = useStore((s) => s.setHoleLabelOffset);
  const setTraceLabelOffset = useStore((s) => s.setTraceLabelOffset);
  const addConstraint = useStore((s) => s.addConstraint);
  const deleteConstraint = useStore((s) => s.deleteConstraint);
  const solveStatus = useStore((s) => s.solveStatus);
  const autoSolve = useStore((s) => s.autoSolve);
  const toggleAutoSolve = useStore((s) => s.toggleAutoSolve);
  const runSolve = useStore((s) => s.runSolve);
  const conflictingIds = useStore((s) => s.conflictingIds);
  const addParameter = useStore((s) => s.addParameter);
  const updateParameter = useStore((s) => s.updateParameter);
  const deleteParameter = useStore((s) => s.deleteParameter);
  const measurePoints = useStore((s) => s.measurePoints);
  const clearMeasure = useStore((s) => s.clearMeasure);
  const deleteConstructionLine = useStore((s) => s.deleteConstructionLine);

  return (
    <aside className="w-72 bg-panel border-l border-border flex flex-col text-sm">
      <Section title="Tool">
        <div className="text-muted text-xs">
          {tool === 'select' &&
            'click entity to select. drag selected hole to move. Delete = delete. middle/right drag = pan.'}
          {tool === 'board' &&
            'click to place outline vertex. click first vertex / Enter to close. Esc cancels.'}
          {tool === 'hole' && `click canvas to place a ${DEFAULT_HOLE_DIAMETER_MM} mm hole.`}
          {tool === 'trace' &&
            'click to place nodes. snap to hole = magenta / snap to trace = T-junction. Enter or RMB to finish. Esc cancels.'}
          {tool === 'chain' &&
            'click to anchor first pad. move mouse — pads extend at 2.54 mm pitch. RMB to commit all pads with spacing constraints. Esc cancels.'}
          {tool === 'measure' &&
            'click 2 points → distance. click 3rd point → angle at middle. Esc clears. Next click restarts.'}
          {tool === 'constr' &&
            'click 2 points to draw a guide line (extends to infinity). Esc cancels current line.'}
        </div>
      </Section>

      {/* ── Measure readout ── */}
      {tool === 'measure' && (
        <Section title="Measure">
          <MeasurePanel points={measurePoints} onClear={clearMeasure} />
        </Section>
      )}

      {/* ── Guide lines ── */}
      {(tool === 'constr' || (tool === 'select' && project.constructionLines.length > 0)) && (
        <Section title="Guide Lines">
          <GuidePanel lines={project.constructionLines} onDelete={deleteConstructionLine} />
        </Section>
      )}

      <Section title="Selection">
        {selection.kind === 'none' && <div className="text-muted text-xs">nothing selected</div>}

        {selection.kind === 'hole' &&
          (() => {
            const hole = project.holes.find((h) => h.id === selection.id);
            if (!hole) return <div className="text-muted text-xs">hole missing</div>;
            return (
              <div className="space-y-2">
                <Field label="id">
                  <span className="font-mono text-xs">{hole.id}</span>
                </Field>
                <Field label="x mm">
                  <NumberInput
                    value={hole.position.x}
                    onChange={(v) => updateHole(hole.id, { position: { ...hole.position, x: v } })}
                  />
                </Field>
                <Field label="y mm">
                  <NumberInput
                    value={hole.position.y}
                    onChange={(v) => updateHole(hole.id, { position: { ...hole.position, y: v } })}
                  />
                </Field>
                <Field label="diameter mm">
                  <NumberInput
                    value={hole.diameter}
                    min={0.1}
                    step={0.1}
                    onChange={(v) => updateHole(hole.id, { diameter: v })}
                  />
                </Field>
                <Field label="kind">
                  <select
                    className="bg-bg border border-border rounded px-1 py-0.5 text-text text-xs w-full"
                    value={hole.kind ?? 'pad'}
                    onChange={(e) => updateHole(hole.id, { kind: e.target.value as HoleKind })}
                  >
                    <option value="pad">pad — through-hole component</option>
                    <option value="via">via — layer connection</option>
                    <option value="mount">mount — mechanical only</option>
                  </select>
                </Field>
                {FEATURES.labels && (
                  <Field label="label">
                    <input
                      type="text"
                      className="bg-bg border border-border rounded px-1 py-0.5 text-text text-xs w-full"
                      placeholder="e.g. R1"
                      value={hole.label ?? ''}
                      onChange={(e) => updateHole(hole.id, { label: e.target.value || undefined })}
                    />
                    {hole.label && (
                      <button
                        className="mt-1 w-full text-xs text-muted hover:text-accent"
                        onClick={() => setHoleLabelOffset(hole.id, { x: 3, y: -3 })}
                      >
                        reset label position
                      </button>
                    )}
                  </Field>
                )}
                <button
                  onClick={() => deleteHole(hole.id)}
                  className="w-full mt-1 px-2 py-1 rounded border border-border bg-bg hover:border-red-500 hover:text-red-400 text-xs"
                >
                  delete hole — Delete
                </button>
              </div>
            );
          })()}

        {selection.kind === 'trace' &&
          (() => {
            const trace = project.traces.find((t) => t.id === selection.id);
            if (!trace) return <div className="text-muted text-xs">trace missing</div>;
            return (
              <div className="space-y-2">
                <Field label="id">
                  <span className="font-mono text-xs">{trace.id}</span>
                </Field>
                <Field label="nodes">
                  <span className="text-xs">{trace.nodes.length}</span>
                </Field>
                <Field label="width mm">
                  <NumberInput
                    value={trace.width}
                    min={0.05}
                    step={0.05}
                    onChange={(v) => updateTrace(trace.id, { width: v })}
                  />
                </Field>
                {FEATURES.labels && (
                  <Field label="label">
                    <input
                      type="text"
                      className="bg-bg border border-border rounded px-1 py-0.5 text-text text-xs w-full"
                      placeholder="e.g. GND"
                      value={trace.label ?? ''}
                      onChange={(e) => updateTrace(trace.id, { label: e.target.value || undefined })}
                    />
                    {trace.label && (
                      <button
                        className="mt-1 w-full text-xs text-muted hover:text-accent"
                        onClick={() => setTraceLabelOffset(trace.id, { x: 3, y: -3 })}
                      >
                        reset label position
                      </button>
                    )}
                  </Field>
                )}
                {FEATURES.unentangle && <UnentanglePanel traceId={trace.id} />}
                <button
                  onClick={() => deleteTrace(trace.id)}
                  className="w-full mt-1 px-2 py-1 rounded border border-border bg-bg hover:border-red-500 hover:text-red-400 text-xs"
                >
                  delete trace — Delete
                </button>
              </div>
            );
          })()}

        {selection.kind === 'board' && (
          <div className="text-muted text-xs">
            board: {project.board?.vertices.length ?? 0} vertices
          </div>
        )}

        {selection.kind === 'board-vertex' && (() => {
          const v = project.board?.vertices[selection.vertexIndex];
          if (!v) return <div className="text-muted text-xs">vertex missing</div>;
          return (
            <div className="space-y-1">
              <Field label="vertex">
                <span className="font-mono text-xs">{selection.vertexIndex}</span>
              </Field>
              <Field label="x mm">
                <span className="font-mono text-xs">{v.x.toFixed(3)}</span>
              </Field>
              <Field label="y mm">
                <span className="font-mono text-xs">{v.y.toFixed(3)}</span>
              </Field>
            </div>
          );
        })()}

        {selection.kind === 'board-edge' && (() => {
          const board = project.board;
          if (!board) return <div className="text-muted text-xs">edge missing</div>;
          const n = board.vertices.length;
          const i = selection.edgeIndex;
          const a = board.vertices[i];
          const b = board.vertices[(i + 1) % n];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          return (
            <div className="space-y-1">
              <Field label="edge">
                <span className="font-mono text-xs">{i}→{(i + 1) % n}</span>
              </Field>
              <Field label="length mm">
                <span className="font-mono text-xs">{len.toFixed(3)}</span>
              </Field>
            </div>
          );
        })()}

        {selection.kind === 'constr-line' && (() => {
          const cl = project.constructionLines.find((l) => l.id === selection.id);
          if (!cl) return <div className="text-muted text-xs">guide line missing</div>;
          const len = Math.hypot(cl.end.x - cl.start.x, cl.end.y - cl.start.y);
          const angleRad = Math.atan2(cl.end.y - cl.start.y, cl.end.x - cl.start.x);
          const angleDeg = angleRad * 180 / Math.PI;
          return (
            <div className="space-y-1">
              <Field label="id">
                <span className="font-mono text-xs text-purple-400">{cl.id}</span>
              </Field>
              <Field label="start">
                <span className="font-mono text-xs">{cl.start.x.toFixed(3)}, {cl.start.y.toFixed(3)}</span>
              </Field>
              <Field label="end">
                <span className="font-mono text-xs">{cl.end.x.toFixed(3)}, {cl.end.y.toFixed(3)}</span>
              </Field>
              <Field label="length mm">
                <span className="font-mono text-xs">{len.toFixed(3)}</span>
              </Field>
              <Field label="angle °">
                <span className="font-mono text-xs">{angleDeg.toFixed(2)}</span>
              </Field>
              <div className="text-muted text-xs mt-1">use the Constraints panel below to add constraints referencing this guide line</div>
            </div>
          );
        })()}
      </Section>

      <Section title="Project">
        <div className="text-xs text-muted space-y-0.5">
          <div>board: {project.board ? 'set' : 'none'}</div>
          <div>holes: {project.holes.length}</div>
          <div>traces: {project.traces.length}</div>
          <div>constraints: {project.constraints.length}</div>
        </div>
      </Section>

      <Section title="Parameters">
        <ParametersPanel
          parameters={project.parameters}
          onAdd={addParameter}
          onUpdate={updateParameter}
          onDelete={deleteParameter}
        />
      </Section>

      <Section title="Constraints">
        <ConstraintPanel
          project={project}
          selection={selection}
          conflictingIds={conflictingIds}
          onAdd={addConstraint}
          onDelete={deleteConstraint}
        />
      </Section>

      <Section title="Solver">
        <SolverPanel
          solveStatus={solveStatus}
          autoSolve={autoSolve}
          onToggleAutoSolve={toggleAutoSolve}
          onRunSolve={runSolve}
        />
      </Section>
    </aside>
  );
}

// ─── Constraint types that need exactly 1 entity ──────────────────────────────
const SINGLE_ENTITY_TYPES: ConstraintType[] = ['horizontal', 'vertical', 'fixed'];
// Constraint types that need a numeric value
const VALUED_TYPES: ConstraintType[] = ['distance', 'angle'];

// ─── Measure the current value between two pinned entities ───────────────────
function measureBetween(
  e1: EntityPin,
  e2: EntityPin,
  project: Project,
): { distance: number | null; angle: number | null } {
  if (!e1 || !e2) return { distance: null, angle: null };

  const getPoint = (ep: NonNullable<EntityPin>): { x: number; y: number } | null => {
    if (ep.kind === 'hole') {
      return project.holes.find((h) => h.id === ep.id)?.position ?? null;
    }
    if (ep.kind === 'board-vertex') {
      // id format: bv_<boardId>_<index>
      const idx = parseInt(ep.id.split('_').pop() ?? '', 10);
      return project.board?.vertices[idx] ?? null;
    }
    return null;
  };

  const getLine = (
    ep: NonNullable<EntityPin>,
  ): [{ x: number; y: number }, { x: number; y: number }] | null => {
    if (ep.kind === 'board-edge') {
      // id format: be_<boardId>_<index>
      const idx = parseInt(ep.id.split('_').pop() ?? '', 10);
      const b = project.board;
      if (!b) return null;
      const n = b.vertices.length;
      return [b.vertices[idx % n], b.vertices[(idx + 1) % n]];
    }
    if (ep.kind === 'constr-line') {
      // id format: cl_<clId>
      const clId = ep.id.replace(/^cl_/, '');
      const cl = project.constructionLines.find((l) => l.id === clId);
      return cl ? [cl.start, cl.end] : null;
    }
    return null;
  };

  const p1 = getPoint(e1);
  const p2 = getPoint(e2);
  const l1 = getLine(e1);
  const l2 = getLine(e2);

  // point ↔ point
  if (p1 && p2) {
    return { distance: Math.hypot(p2.x - p1.x, p2.y - p1.y), angle: null };
  }
  // point ↔ line (perpendicular distance)
  if (p1 && l2) {
    const [a, b] = l2;
    const dx = b.x - a.x; const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-10) return { distance: null, angle: null };
    return { distance: Math.abs((p1.y - a.y) * dx - (p1.x - a.x) * dy) / len, angle: null };
  }
  if (p2 && l1) {
    const [a, b] = l1;
    const dx = b.x - a.x; const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-10) return { distance: null, angle: null };
    return { distance: Math.abs((p2.y - a.y) * dx - (p2.x - a.x) * dy) / len, angle: null };
  }
  // line ↔ line (angle + perpendicular distance for parallel case)
  if (l1 && l2) {
    const a1 = Math.atan2(l1[1].y - l1[0].y, l1[1].x - l1[0].x);
    const a2 = Math.atan2(l2[1].y - l2[0].y, l2[1].x - l2[0].x);
    let deg = Math.abs((a2 - a1) * (180 / Math.PI));
    if (deg > 180) deg = 360 - deg;
    // Perpendicular distance from l2[0] to the infinite line through l1.
    // Meaningful when lines are parallel (deg ≈ 0 or 180); equals 0 when they intersect.
    const dx = l1[1].x - l1[0].x;
    const dy = l1[1].y - l1[0].y;
    const len = Math.hypot(dx, dy);
    const dist = len < 1e-10 ? null
      : Math.abs((l2[0].y - l1[0].y) * dx - (l2[0].x - l1[0].x) * dy) / len;
    return { distance: dist, angle: deg };
  }
  return { distance: null, angle: null };
}

// ─── Parameters panel ────────────────────────────────────────────────────────

function ParametersPanel({
  parameters,
  onAdd,
  onUpdate,
  onDelete,
}: {
  parameters: { name: string; value: number }[];
  onAdd: (name: string, value: number) => void;
  onUpdate: (name: string, value: number) => void;
  onDelete: (name: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('1');

  function handleAdd() {
    const name = newName.trim();
    if (!name || parameters.some((p) => p.name === name)) return;
    const v = parseFloat(newValue);
    if (!Number.isFinite(v)) return;
    onAdd(name, v);
    setNewName('');
    setNewValue('1');
  }

  return (
    <div className="space-y-2">
      {parameters.length === 0 ? (
        <div className="text-muted text-xs">no parameters</div>
      ) : (
        <ul className="space-y-1">
          {parameters.map((p) => (
            <li key={p.name} className="flex items-center gap-1">
              <span className="font-mono text-xs text-accent shrink-0 min-w-[60px] truncate" title={p.name}>
                {p.name}
              </span>
              <span className="text-muted text-xs">=</span>
              <input
                type="number"
                value={p.value}
                step={0.01}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) onUpdate(p.name, v);
                }}
                className="flex-1 w-0 min-w-0 bg-bg border border-border rounded px-1 py-0.5 text-text font-mono text-xs"
              />
              <button
                onClick={() => onDelete(p.name)}
                className="shrink-0 text-muted hover:text-red-400 px-1"
                title="delete parameter"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add parameter form */}
      <div className="flex gap-1 items-center">
        <input
          type="text"
          placeholder="name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          className="flex-1 w-0 min-w-0 bg-bg border border-border rounded px-1 py-0.5 text-text font-mono text-xs"
        />
        <span className="text-muted text-xs">=</span>
        <input
          type="number"
          value={newValue}
          step={0.01}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          className="w-16 bg-bg border border-border rounded px-1 py-0.5 text-text font-mono text-xs"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || !Number.isFinite(parseFloat(newValue))}
          className="shrink-0 px-1.5 py-0.5 rounded border border-border bg-bg hover:border-accent disabled:opacity-40 text-xs"
        >
          +
        </button>
      </div>
    </div>
  );
}

type EntityPin = { kind: 'hole' | 'trace' | 'board-vertex' | 'board-edge' | 'constr-line'; id: string; label: string } | null;

function describeSelection(
  sel: { kind: string; id?: string; vertexIndex?: number; edgeIndex?: number },
  project: { holes: { id: string; label?: string }[]; traces: { id: string }[]; board: { id: string; vertices: { x: number; y: number }[] } | null; constructionLines: { id: string; start: { x: number; y: number }; end: { x: number; y: number } }[] },
): EntityPin {
  if (sel.kind === 'hole' && sel.id) {
    const h = project.holes.find((x) => x.id === sel.id);
    return h ? { kind: 'hole', id: h.id, label: h.label ?? h.id } : null;
  }
  if (sel.kind === 'trace' && sel.id) {
    const t = project.traces.find((x) => x.id === sel.id);
    return t ? { kind: 'trace', id: t.id, label: t.id } : null;
  }
  if (sel.kind === 'board-vertex' && sel.vertexIndex !== undefined && project.board) {
    return {
      kind: 'board-vertex',
      id: `bv_${project.board.id}_${sel.vertexIndex}`,
      label: `vertex ${sel.vertexIndex}`,
    };
  }
  if (sel.kind === 'board-edge' && sel.edgeIndex !== undefined && project.board) {
    const n = project.board.vertices.length;
    return {
      kind: 'board-edge',
      id: `be_${project.board.id}_${sel.edgeIndex}`,
      label: `edge ${sel.edgeIndex}→${(sel.edgeIndex + 1) % n}`,
    };
  }  if (sel.kind === 'constr-line' && sel.id) {
    const cl = project.constructionLines.find((l) => l.id === sel.id);
    if (!cl) return null;
    return {
      kind: 'constr-line',
      id: `cl_${cl.id}`,
      label: `guide (${cl.start.x.toFixed(1)},${cl.start.y.toFixed(1)})\u2192(${cl.end.x.toFixed(1)},${cl.end.y.toFixed(1)})`,
    };
  }  return null;
}

function ConstraintPanel({
  project,
  selection,
  conflictingIds,
  onAdd,
  onDelete,
}: {
  project: Project;
  selection: Parameters<typeof describeSelection>[0];
  conflictingIds: string[];
  onAdd: (c: Omit<import('../model/types').Constraint, 'id'>) => void;
  onDelete: (id: string) => void;
}) {
  const [pinnedE1, setPinnedE1] = useState<EntityPin>(null);
  const [constraintType, setConstraintType] = useState<ConstraintType>('distance');
  // valueMode: 'number' or 'param'
  const [valueMode, setValueMode] = useState<'number' | 'param'>('number');
  const [valueStr, setValueStr] = useState('1');
  const [paramRef, setParamRef] = useState('');

  const currentEntity = describeSelection(selection, project);
  const isSingle = SINGLE_ENTITY_TYPES.includes(constraintType);
  const needsValue = VALUED_TYPES.includes(constraintType);

  const e1: EntityPin = isSingle ? currentEntity : pinnedE1;
  const e2: EntityPin = isSingle ? null : currentEntity;

  // Auto-fill the value field with the actual measured value when both entities
  // are selected and the constraint type needs a value.
  useEffect(() => {
    if (!needsValue || valueMode !== 'number' || isSingle) return;
    const measured = measureBetween(pinnedE1, currentEntity, project);
    if (constraintType === 'distance' && measured.distance !== null) {
      setValueStr(measured.distance.toFixed(2));
    } else if (constraintType === 'angle' && measured.angle !== null) {
      setValueStr(measured.angle.toFixed(2));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedE1, selection, constraintType, needsValue, valueMode]);

  // When user pins e1, also immediately fill with measured value
  function handlePin() {
    setPinnedE1(currentEntity);
  }

  const valueValid = !needsValue || (
    valueMode === 'number'
      ? Number.isFinite(parseFloat(valueStr))
      : paramRef !== '' && project.parameters.some((p) => p.name === paramRef)
  );

  const canAdd = e1 !== null && (isSingle || e2 !== null) && valueValid;

  function handleAdd() {
    if (!canAdd || !e1) return;
    const entityIds = isSingle ? [e1.id] : [e1.id, e2!.id];
    let value: number | string | undefined = undefined;
    if (needsValue) {
      value = valueMode === 'number' ? parseFloat(valueStr) : paramRef;
    }
    onAdd({ type: constraintType, entityIds, value, driving: true });
  }

  const allTypes: ConstraintType[] = ['distance', 'horizontal', 'vertical', 'perpendicular', 'angle', 'coincident', 'fixed', 'equal'];

  // Compact entity label: last segment after final underscore
  const shortId = (id: string) => {
    const parts = id.split('_');
    return parts[parts.length - 1] ?? id;
  };

  return (
    <div className="space-y-3">
      {/* Existing constraints list */}
      {project.constraints.length === 0 ? (
        <div className="text-muted text-xs">no constraints</div>
      ) : (
        <ul className="space-y-1">
          {project.constraints.map((c) => {
            const isConflict = conflictingIds.includes(c.id);
            const paramUsed = typeof c.value === 'string' ? c.value : null;
            const resolvedVal = paramUsed
              ? project.parameters.find((p) => p.name === paramUsed)?.value
              : c.value;
            return (
              <li
                key={c.id}
                className={`flex items-center justify-between gap-1 px-1 py-0.5 rounded text-xs ${isConflict ? 'bg-red-950 text-red-300' : 'bg-bg'}`}
              >
                <span className="font-mono truncate max-w-[80%]">
                  {c.type}
                  {c.value !== undefined
                    ? ` = ${paramUsed ? <span title={`${resolvedVal}`}>{paramUsed}</span> : resolvedVal}`
                    : ''}
                  {c.value !== undefined && ` = `}
                  {c.value !== undefined && (paramUsed
                    ? <span className="text-accent" title={`= ${resolvedVal} mm`}>{paramUsed}</span>
                    : String(resolvedVal))}
                  {' '}
                  <span className="text-muted">[{c.entityIds.map(shortId).join(', ')}]</span>
                </span>
                <button
                  onClick={() => onDelete(c.id)}
                  className="shrink-0 text-muted hover:text-red-400 px-1"
                  title="delete constraint"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add constraint form */}
      <div className="border border-border rounded p-2 space-y-2">
        <div className="text-xs text-muted font-medium">Add constraint</div>

        {/* Type picker */}
        <select
          value={constraintType}
          onChange={(e) => setConstraintType(e.target.value as ConstraintType)}
          className="w-full bg-bg border border-border rounded px-1 py-0.5 text-xs text-text"
        >
          {allTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Entity 1 */}
        {!isSingle && (
          <div className="flex items-center gap-1">
            <span className="text-muted text-xs w-14 shrink-0">entity 1</span>
            <span className="flex-1 font-mono text-xs truncate text-text">
              {pinnedE1 ? `${pinnedE1.kind}:${pinnedE1.label}` : <span className="text-muted">not pinned</span>}
            </span>
            <button
              onClick={() => handlePin()}
              disabled={!currentEntity}
              className="shrink-0 px-1.5 py-0.5 rounded border border-border bg-bg text-xs hover:border-accent disabled:opacity-40"
              title="pin current selection as entity 1"
            >
              pin
            </button>
          </div>
        )}

        {/* Entity 2 / current entity */}
        <div className="flex items-center gap-1">
          <span className="text-muted text-xs w-14 shrink-0">{isSingle ? 'entity' : 'entity 2'}</span>
          <span className="flex-1 font-mono text-xs truncate text-text">
            {currentEntity ? `${currentEntity.kind}:${currentEntity.label}` : <span className="text-muted">nothing selected</span>}
          </span>
        </div>

        {/* Value input */}
        {needsValue && (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-muted text-xs w-14 shrink-0">
                {constraintType === 'angle' ? 'angle °' : 'dist mm'}
              </span>
              <div className="flex flex-1 gap-0.5">
                <button
                  onClick={() => setValueMode('number')}
                  className={`px-1.5 py-0.5 rounded-l border text-xs ${valueMode === 'number' ? 'bg-accent border-accent text-white' : 'border-border bg-bg text-muted'}`}
                >
                  #
                </button>
                <button
                  onClick={() => setValueMode('param')}
                  disabled={project.parameters.length === 0}
                  className={`px-1.5 py-0.5 rounded-r border text-xs ${valueMode === 'param' ? 'bg-accent border-accent text-white' : 'border-border bg-bg text-muted'} disabled:opacity-40`}
                  title="reference a named parameter"
                >
                  @param
                </button>
              </div>
            </div>
            {valueMode === 'number' ? (
              <input
                type="number"
                value={valueStr}
                min={0}
                step={0.1}
                onChange={(e) => setValueStr(e.target.value)}
                className="w-full bg-bg border border-border rounded px-1 py-0.5 text-text font-mono text-xs"
              />
            ) : (
              <select
                value={paramRef}
                onChange={(e) => setParamRef(e.target.value)}
                className="w-full bg-bg border border-border rounded px-1 py-0.5 text-xs text-text"
              >
                <option value="">-- pick parameter --</option>
                {project.parameters.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} = {p.value}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={!canAdd}
          className="w-full px-2 py-1 rounded border border-border bg-bg hover:border-accent disabled:opacity-40 text-xs"
        >
          add constraint
        </button>
      </div>
    </div>
  );
}

function SolverPanel({
  solveStatus,
  autoSolve,
  onToggleAutoSolve,
  onRunSolve,
}: {
  solveStatus: { ok: boolean; msg: string } | null;
  autoSolve: boolean;
  onToggleAutoSolve: () => void;
  onRunSolve: () => Promise<void>;
}) {
  const [running, setRunning] = useState(false);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {/* Auto-solve toggle */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={autoSolve}
          onChange={onToggleAutoSolve}
          className="accent-accent"
        />
        <span className="text-xs">auto-solve on constraint changes</span>
      </label>

      {/* Solve now */}
      <button
        disabled={running}
        onClick={async () => {
          setRunning(true);
          await onRunSolve();
          setRunning(false);
        }}
        className="w-full px-2 py-1 rounded border border-border bg-bg hover:border-accent disabled:opacity-50 text-xs"
      >
        {running ? 'solving...' : 'solve now'}
      </button>

      {/* Solve status */}
      {solveStatus && (
        <div
          className={`text-xs px-2 py-1 rounded border ${solveStatus.ok ? 'border-green-700 text-green-400 bg-green-950' : 'border-red-700 text-red-400 bg-red-950'}`}
        >
          {solveStatus.msg}
        </div>
      )}

      {/* Verify WASM */}
      <button
        disabled={running}
        onClick={async () => {
          setRunning(true);
          setVerifyResult('loading…');
          const r = await verifyPlanegcs();
          setVerifyResult(r);
          setRunning(false);
        }}
        className="w-full px-2 py-1 rounded border border-border bg-bg hover:border-accent disabled:opacity-50 text-xs"
      >
        verify planegcs wasm
      </button>
      {verifyResult && (
        <pre className="text-[10px] text-muted bg-bg border border-border rounded p-2 whitespace-pre-wrap min-h-[40px]">
          {verifyResult}
        </pre>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted mb-2">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted text-xs">{label}</span>
      <div className="flex-1 max-w-[60%]">{children}</div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  step = 0.01,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      step={step}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-full bg-bg border border-border rounded px-1 py-0.5 text-text font-mono text-xs"
    />
  );
}

// ─── Measure panel ─────────────────────────────────────────────────────────────

function fmtMm(d: number): string {
  return d < 10 ? `${d.toFixed(3)} mm` : `${d.toFixed(2)} mm`;
}
function fmtDeg(a: number): string {
  return `${a.toFixed(2)}°`;
}
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function MeasurePanel({
  points,
  onClear,
}: {
  points: { x: number; y: number }[];
  onClear: () => void;
}) {
  if (points.length === 0) {
    return <div className="text-muted text-xs">click on canvas to place first point</div>;
  }
  const [A, B, C] = points;
  return (
    <div className="space-y-2 text-xs">
      {points.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <span className="text-muted w-4">{['A','B','C'][i]}</span>
          <span className="font-mono">{p.x.toFixed(3)}, {p.y.toFixed(3)} mm</span>
        </div>
      ))}
      {points.length >= 2 && (
        <div className="border-t border-border pt-2">
          <div className="flex justify-between">
            <span className="text-muted">A → B distance</span>
            <span className="font-mono text-green-400">{fmtMm(dist(A.x, A.y, B.x, B.y))}</span>
          </div>
        </div>
      )}
      {points.length === 3 && (() => {
        const BAx = A.x - B.x; const BAy = A.y - B.y;
        const BCx = C.x - B.x; const BCy = C.y - B.y;
        const dot = BAx * BCx + BAy * BCy;
        const cross = BAx * BCy - BAy * BCx;
        const angle = Math.abs(Math.atan2(Math.abs(cross), dot)) * 180 / Math.PI;
        return (
          <div className="flex justify-between">
            <span className="text-muted">∠ at B</span>
            <span className="font-mono text-yellow-400">{fmtDeg(angle)}</span>
          </div>
        );
      })()}
      <button
        onClick={onClear}
        className="mt-1 w-full px-2 py-1 rounded border border-border bg-bg hover:border-red-500 hover:text-red-400 text-xs"
      >
        Clear — Esc
      </button>
    </div>
  );
}

// ─── Guide lines panel ─────────────────────────────────────────────────────────

function GuidePanel({
  lines,
  onDelete,
}: {
  lines: { id: string; start: { x: number; y: number }; end: { x: number; y: number }; label?: string }[];
  onDelete: (id: string) => void;
}) {
  if (lines.length === 0) {
    return <div className="text-muted text-xs">no guide lines yet — click two points on canvas</div>;
  }
  return (
    <div className="space-y-1 text-xs">
      {lines.map((cl) => (
        <div key={cl.id} className="flex items-center justify-between gap-2 group">
          <span className="font-mono text-purple-400 truncate flex-1">
            ({cl.start.x.toFixed(2)}, {cl.start.y.toFixed(2)}) → ({cl.end.x.toFixed(2)}, {cl.end.y.toFixed(2)})
          </span>
          <button
            onClick={() => onDelete(cl.id)}
            className="shrink-0 px-1 rounded border border-transparent group-hover:border-red-500 group-hover:text-red-400 text-muted"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
