import { useStore } from '../model/store';
import type { Tool } from '../model/types';
import { downloadGerberZip } from '../export/gerber';
import { saveProjectJson, loadProjectJson } from '../export/fileio';

const tools: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'V' },
  { id: 'board', label: 'Board', hint: 'B' },
  { id: 'hole', label: 'Hole', hint: 'H' },
  { id: 'trace', label: 'Trace', hint: 'T' },
  { id: 'chain', label: 'Chain Pad', hint: 'P' },
  { id: 'measure', label: 'Measure', hint: 'M' },
  { id: 'constr', label: 'Guide', hint: 'G' },
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const draftBoard = useStore((s) => s.draftBoard);
  const closeBoard = useStore((s) => s.closeBoard);
  const cancelBoard = useStore((s) => s.cancelBoard);
  const draftTrace = useStore((s) => s.draftTrace);
  const finishTrace = useStore((s) => s.finishTrace);
  const cancelTrace = useStore((s) => s.cancelTrace);
  const snap = useStore((s) => s.snapToGrid);
  const toggleSnap = useStore((s) => s.toggleSnap);
  const gridMm = useStore((s) => s.gridMm);
  const setGridMm = useStore((s) => s.setGridMm);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const history = useStore((s) => s.history);
  const future = useStore((s) => s.future);
  const project = useStore((s) => s.project);
  const loadProject = useStore((s) => s.loadProject);
  const showConstruction = useStore((s) => s.showConstruction);
  const toggleConstruction = useStore((s) => s.toggleConstruction);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-panel border-b border-border text-sm flex-wrap">
      <span className="font-semibold mr-2">EasyPCB</span>

      {/* Tool buttons */}
      <div className="flex gap-1">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`px-3 py-1 rounded border ${
              tool === t.id
                ? 'bg-accent text-white border-accent'
                : 'bg-bg border-border hover:border-accent text-text'
            }`}
            title={`${t.label} (${t.hint})`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Board draft controls */}
      {draftBoard && (
        <div className="flex gap-1 ml-2">
          <button
            onClick={closeBoard}
            disabled={draftBoard.vertices.length < 3}
            className="px-2 py-1 rounded border border-border bg-bg hover:border-accent disabled:opacity-40"
          >
            Close ({draftBoard.vertices.length}) — Enter
          </button>
          <button
            onClick={cancelBoard}
            className="px-2 py-1 rounded border border-border bg-bg hover:border-accent"
          >
            Cancel — Esc
          </button>
        </div>
      )}

      {/* Trace draft controls */}
      {tool === 'trace' && draftTrace && (
        <div className="flex gap-1 ml-2">
          <button
            onClick={finishTrace}
            disabled={draftTrace.nodes.length < 2}
            className="px-2 py-1 rounded border border-border bg-bg hover:border-accent disabled:opacity-40"
          >
            Finish ({draftTrace.nodes.length}) — Enter / RMB
          </button>
          <button
            onClick={cancelTrace}
            className="px-2 py-1 rounded border border-border bg-bg hover:border-accent"
          >
            Cancel — Esc
          </button>
        </div>
      )}

      {/* Undo / Redo */}
      <div className="flex gap-1 ml-2">
        <button
          onClick={undo}
          disabled={history.length === 0}
          className="px-2 py-1 rounded border border-border bg-bg hover:border-accent disabled:opacity-40 text-xs"
          title="Undo (Ctrl+Z)"
        >
          ↩ Undo
        </button>
        <button
          onClick={redo}
          disabled={future.length === 0}
          className="px-2 py-1 rounded border border-border bg-bg hover:border-accent disabled:opacity-40 text-xs"
          title="Redo (Ctrl+Y)"
        >
          ↪ Redo
        </button>
      </div>

      {/* File / Export */}
      <div className="flex gap-1 ml-2">
        <button
          onClick={() => saveProjectJson(project)}
          className="px-2 py-1 rounded border border-border bg-bg hover:border-accent text-xs"
          title="Save project as JSON"
        >
          Save
        </button>
        <button
          onClick={() => loadProjectJson().then(loadProject)}
          className="px-2 py-1 rounded border border-border bg-bg hover:border-accent text-xs"
          title="Load project from JSON"
        >
          Load
        </button>
        <button
          onClick={() => downloadGerberZip(project)}
          className="px-2 py-1 rounded border border-border bg-bg hover:border-accent text-xs"
          title="Export Gerber / Excellon zip"
        >
          Gerber
        </button>
      </div>

      {/* Construction line visibility toggle */}
      <button
        onClick={toggleConstruction}
        className={`px-2 py-1 rounded border text-xs ${
          showConstruction
            ? 'border-purple-500 text-purple-400 bg-bg'
            : 'border-border text-muted bg-bg'
        }`}
        title="Toggle guide line visibility"
      >
        {showConstruction ? 'Guides ✓' : 'Guides ✗'}
      </button>

      <div className="ml-auto flex items-center gap-3 text-xs text-muted">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={snap} onChange={toggleSnap} />
          snap
        </label>
        <label className="flex items-center gap-1">
          grid
          <select
            className="bg-bg border border-border rounded px-1 py-0.5 text-text"
            value={gridMm}
            onChange={(e) => setGridMm(parseFloat(e.target.value))}
          >
            <option value={0.1}>0.1</option>
            <option value={0.25}>0.25</option>
            <option value={0.5}>0.5</option>
            <option value={1}>1</option>
            <option value={2.54}>2.54</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
          mm
        </label>
      </div>
    </div>
  );
}
