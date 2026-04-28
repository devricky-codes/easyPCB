import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage } from 'react-konva';
import type Konva from 'konva';
import { useStore } from '../model/store';
import { GridLayer } from './GridLayer';
import { BoardLayer } from './BoardLayer';
import { HoleLayer } from './HoleLayer';
import { TraceLayer } from './TraceLayer';
import { ConstraintLayer } from './ConstraintLayer';
import { ConstructionLayer } from './ConstructionLayer';
import { MeasureLayer } from './MeasureLayer';
import { ChainLayer, computeChainPositions } from './ChainLayer';
import { pxToMm, snapPoint, getAdaptiveGridStep, fmtGridStep } from './viewport';
import type { Board, Hole, Point, Project, Trace } from '../model/types';
import { MIN_PX_PER_MM, MAX_PX_PER_MM, ZOOM_STEP } from '../constants';
import { findTraceAt, resolveTrace } from '../model/traceUtils';

const SELECT_HALO_PX = 6;
/** Snap radius for snapping to hole centres when drawing traces (px). */
const HOLE_SNAP_PX = 12;
/** Snap radius for T-junction snapping (mm). Scales with zoom. */
const TRACE_SNAP_MM = 1.5;

// Returns holes whose visual radius + halo contains the click point.
function findHolesAt(holes: Hole[], mm: Point, pxPerMm: number): Hole[] {
  const hits: { h: Hole; d: number }[] = [];
  for (const h of holes) {
    const dx = h.position.x - mm.x;
    const dy = h.position.y - mm.y;
    const distPx = Math.hypot(dx, dy) * pxPerMm;
    const radiusPx = (h.diameter / 2) * pxPerMm;
    const hitPx = Math.max(radiusPx, 2) + SELECT_HALO_PX;
    if (distPx <= hitPx) hits.push({ h, d: distPx });
  }
  hits.sort((a, b) => a.d - b.d);
  return hits.map((x) => x.h);
}

// Returns the closest hole if within HOLE_SNAP_PX, used for trace endpoint snapping.
function findSnapHole(holes: Hole[], mm: Point, pxPerMm: number): Hole | null {
  let best: { h: Hole; d: number } | null = null;
  for (const h of holes) {
    const distPx = Math.hypot(h.position.x - mm.x, h.position.y - mm.y) * pxPerMm;
    if (distPx <= HOLE_SNAP_PX && (!best || distPx < best.d)) {
      best = { h, d: distPx };
    }
  }
  return best?.h ?? null;
}

// Returns the first board vertex index within SELECT_HALO_PX + 2 of the click point.
function findBoardVertexAt(board: Board, mm: Point, pxPerMm: number): number | null {
  for (let i = 0; i < board.vertices.length; i++) {
    const v = board.vertices[i];
    const distPx = Math.hypot(v.x - mm.x, v.y - mm.y) * pxPerMm;
    if (distPx <= SELECT_HALO_PX + 4) return i;
  }
  return null;
}

// Returns the first board edge index whose segment is within ~4 px of the click point.
function findBoardEdgeAt(board: Board, mm: Point, pxPerMm: number): number | null {
  const haloMm = 4 / pxPerMm;
  for (let i = 0; i < board.vertices.length; i++) {
    const a = board.vertices[i];
    const b = board.vertices[(i + 1) % board.vertices.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((mm.x - a.x) * abx + (mm.y - a.y) * aby) / len2));
    const cx = a.x + t * abx;
    const cy = a.y + t * aby;
    if (Math.hypot(mm.x - cx, mm.y - cy) <= haloMm) return i;
  }
  return null;
}

// Returns cursor position snapped to the nearest trace (within TRACE_SNAP_MM), if any.
function getTraceSnapPoint(
  traces: Trace[],
  project: Project,
  mm: Point,
): { traceId: string; t: number; snappedMm: Point } | null {
  const hit = findTraceAt(traces, project, mm, TRACE_SNAP_MM);
  if (!hit) return null;
  return { traceId: hit.traceId, t: hit.t, snappedMm: hit.closest };
}

// Returns the first construction line within ~4 px of the click point.
// Uses point-to-infinite-line distance so the full extended line is clickable.
function findConstrLineAt(
  lines: import('../model/types').ConstructionLine[],
  mm: Point,
  pxPerMm: number,
): string | null {
  const haloMm = 5 / pxPerMm;
  for (const cl of lines) {
    const dx = cl.end.x - cl.start.x;
    const dy = cl.end.y - cl.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    // perpendicular distance from mm to the infinite line through start+end
    const dist = Math.abs(dx * (cl.start.y - mm.y) - (cl.start.x - mm.x) * dy) / len;
    if (dist <= haloMm) return cl.id;
  }
  return null;
}

export function CanvasRoot() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [cursorMm, setCursorMm] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; offX: number; offY: number } | null>(null);

  // drag-to-move state
  const dragState = useRef<{ holeId: string } | null>(null);
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);

  const tool = useStore((s) => s.tool);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const gridMm = useStore((s) => s.gridMm);
  const snapOn = useStore((s) => s.snapToGrid);
  const project = useStore((s) => s.project);
  const draftBoard = useStore((s) => s.draftBoard);
  const draftTrace = useStore((s) => s.draftTrace);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const pushHistory = useStore((s) => s.pushHistory);
  const pushBoardVertex = useStore((s) => s.pushBoardVertex);
  const closeBoard = useStore((s) => s.closeBoard);
  const cancelBoard = useStore((s) => s.cancelBoard);
  const addHole = useStore((s) => s.addHole);
  const updateHole = useStore((s) => s.updateHole);
  const deleteHole = useStore((s) => s.deleteHole);
  const deleteTrace = useStore((s) => s.deleteTrace);
  const conflictingIds = useStore((s) => s.conflictingIds);
  const pushTraceNode = useStore((s) => s.pushTraceNode);
  const finishTrace = useStore((s) => s.finishTrace);
  const cancelTrace = useStore((s) => s.cancelTrace);
  // measure tool
  const measurePoints = useStore((s) => s.measurePoints);
  const pushMeasurePoint = useStore((s) => s.pushMeasurePoint);
  const clearMeasure = useStore((s) => s.clearMeasure);
  // construction lines
  const showConstruction = useStore((s) => s.showConstruction);
  const draftConstrStart = useStore((s) => s.draftConstrStart);
  const setDraftConstrStart = useStore((s) => s.setDraftConstrStart);
  const addConstructionLine = useStore((s) => s.addConstructionLine);
  // chain-pad tool
  const chainDraft = useStore((s) => s.chainDraft);
  const beginChain = useStore((s) => s.beginChain);
  const commitChainPositions = useStore((s) => s.commitChainPositions);
  const cancelChain = useStore((s) => s.cancelChain);

  // size tracking
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // center origin on first mount
  useEffect(() => {
    setView({ offsetX: size.width / 2, offsetY: size.height / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width === 0, size.height === 0]);

  // keyboard: Esc / Enter (board + trace), Delete (selection)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        cancelBoard();
        cancelTrace();
        clearMeasure();
        setDraftConstrStart(null);
        cancelChain();
      } else if (e.key === 'Enter') {
        if (draftBoard) closeBoard();
        else if (draftTrace && draftTrace.nodes.length >= 2) finishTrace();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.kind === 'hole') deleteHole(selection.id);
        else if (selection.kind === 'trace') deleteTrace(selection.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelBoard, cancelTrace, closeBoard, clearMeasure, setDraftConstrStart, cancelChain, draftBoard, draftTrace, finishTrace, selection, deleteHole, deleteTrace]);

  const screenToModel = useCallback(
    (sx: number, sy: number): Point => {
      const mm = pxToMm({ x: sx, y: sy }, view);
      const snapped = snapOn ? snapPoint(mm, gridMm) : mm;
      // Always round to 0.01 mm — this is the measurement resolution floor.
      return { x: Math.round(snapped.x * 100) / 100, y: Math.round(snapped.y * 100) / 100 };
    },
    [view, snapOn, gridMm],
  );

  /** Fine-resolution variant: skips the coarse snap-grid, always rounds to 0.01 mm.
   *  Used for measure / guide-line / chain tools where sub-grid precision matters. */
  const screenToFine = useCallback(
    (sx: number, sy: number): Point => {
      const mm = pxToMm({ x: sx, y: sy }, view);
      return { x: Math.round(mm.x * 100) / 100, y: Math.round(mm.y * 100) / 100 };
    },
    [view],
  );

  const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    // panning
    if (isPanning && panStart.current) {
      const { x, y, offX, offY } = panStart.current;
      setView({ offsetX: offX + (pos.x - x), offsetY: offY + (pos.y - y) });
      return;
    }

    const mm = screenToModel(pos.x, pos.y);
    const mmFine = screenToFine(pos.x, pos.y);
    // Use fine-resolution for cursor display and for tools that need sub-grid precision.
    const isFineToolActive = tool === 'measure' || tool === 'constr' || tool === 'chain';
    setCursorMm(isFineToolActive ? mmFine : mm);

    // drag-to-move selected hole
    if (dragState.current && mouseDownPos.current && e.evt.buttons === 1) {
      const dx = pos.x - mouseDownPos.current.x;
      const dy = pos.y - mouseDownPos.current.y;
      if (!didDrag.current && Math.hypot(dx, dy) > 4) {
        // crossed threshold — start the drag, save history once
        pushHistory();
        didDrag.current = true;
      }
      if (didDrag.current) {
        updateHole(dragState.current.holeId, { position: mm });
      }
    }
  };

  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (e.evt.button === 1 || e.evt.button === 2) {
      // middle / right → pan
      setIsPanning(true);
      panStart.current = { x: pos.x, y: pos.y, offX: view.offsetX, offY: view.offsetY };
      e.evt.preventDefault();
      return;
    }

    if (e.evt.button === 0 && tool === 'select') {
      // set up potential drag for selected hole
      const mmRaw = pxToMm(pos, view);
      const hits = findHolesAt(project.holes, mmRaw, view.pxPerMm);
      if (hits.length > 0 && selection.kind === 'hole' && hits.some((h) => h.id === selection.id)) {
        dragState.current = { holeId: selection.id };
        mouseDownPos.current = { x: pos.x, y: pos.y };
        didDrag.current = false;
      } else {
        dragState.current = null;
        mouseDownPos.current = null;
      }
    }
  };

  const onMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 1 || e.evt.button === 2) {
      setIsPanning(false);
      panStart.current = null;
    }
    if (e.evt.button === 0) {
      dragState.current = null;
      mouseDownPos.current = null;
      // didDrag stays set until onStageClick reads + clears it
    }
  };

  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (e.evt.button !== 0) return;
    if (isPanning) return;

    // was this a drag? don't treat as click
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }

    const pos = stage.getPointerPosition();
    if (!pos) return;
    const mmRaw = pxToMm({ x: pos.x, y: pos.y }, view);
    const mm = screenToModel(pos.x, pos.y);
    const mmFine = screenToFine(pos.x, pos.y);

    // ---- select tool ----
    if (tool === 'select') {
      // check holes
      const holeHits = findHolesAt(project.holes, mmRaw, view.pxPerMm);
      if (holeHits.length > 0) {
        const curIdx =
          selection.kind === 'hole' ? holeHits.findIndex((h) => h.id === selection.id) : -1;
        const next = holeHits[(curIdx + 1) % holeHits.length];
        setSelection({ kind: 'hole', id: next.id });
        return;
      }
      // check board vertices (before edges and traces)
      if (project.board) {
        const vIdx = findBoardVertexAt(project.board, mmRaw, view.pxPerMm);
        if (vIdx !== null) {
          setSelection({ kind: 'board-vertex', vertexIndex: vIdx });
          return;
        }
      }
      // check traces
      const traceHit = findTraceAtPx(project.traces, project, mmRaw, view.pxPerMm);
      if (traceHit) {
        setSelection({ kind: 'trace', id: traceHit });
        return;
      }
      // check board edges
      if (project.board) {
        const eIdx = findBoardEdgeAt(project.board, mmRaw, view.pxPerMm);
        if (eIdx !== null) {
          setSelection({ kind: 'board-edge', edgeIndex: eIdx });
          return;
        }
      }
      // check construction lines (only when visible)
      if (showConstruction) {
        const clId = findConstrLineAt(project.constructionLines, mmRaw, view.pxPerMm);
        if (clId) {
          setSelection({ kind: 'constr-line', id: clId });
          return;
        }
      }
      setSelection({ kind: 'none' });
      return;
    }

    // ---- board tool ----
    if (tool === 'board') {
      if (draftBoard && draftBoard.vertices.length >= 3) {
        const first = draftBoard.vertices[0];
        const dx = (mm.x - first.x) * view.pxPerMm;
        const dy = (mm.y - first.y) * view.pxPerMm;
        if (Math.hypot(dx, dy) < 8) {
          closeBoard();
          return;
        }
      }
      pushBoardVertex(mm);
      return;
    }

    // ---- hole tool ----
    if (tool === 'hole') {
      const existing = findHolesAt(project.holes, mmRaw, view.pxPerMm);
      if (existing.length > 0) {
        setSelection({ kind: 'hole', id: existing[0].id });
        return;
      }
      addHole(mm);
      return;
    }

    // ---- trace tool ----
    if (tool === 'trace') {
      // snap priority: hole centre > trace (T-junction) > grid
      const snapHole = findSnapHole(project.holes, mmRaw, view.pxPerMm);
      if (snapHole) {
        pushTraceNode({ kind: 'hole', holeId: snapHole.id });
        return;
      }
      const traceSnap = getTraceSnapPoint(project.traces, project, mmRaw);
      if (traceSnap) {
        pushTraceNode({
          kind: 'on_trace',
          traceId: traceSnap.traceId,
          t: traceSnap.t,
        });
        return;
      }
      pushTraceNode({ kind: 'point', position: mm });
      return;
    }

    // ---- measure tool ----
    if (tool === 'measure') {
      pushMeasurePoint(mmFine);
      return;
    }

    // ---- construction line tool ----
    if (tool === 'constr') {
      if (!draftConstrStart) {
        setDraftConstrStart(mmFine);
      } else {
        addConstructionLine(draftConstrStart, mmFine);
      }
      return;
    }

    // ---- chain-pad tool ----
    if (tool === 'chain') {
      if (!chainDraft) {
        beginChain(mmFine);
      }
      // subsequent left-clicks are no-ops; right-click (onContextMenu) commits
      return;
    }
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const dir = e.evt.deltaY < 0 ? 1 : -1;
    const newPx = clamp(
      view.pxPerMm * (dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
      MIN_PX_PER_MM,
      MAX_PX_PER_MM,
    );
    if (newPx === view.pxPerMm) return;
    const mmAtCursor = pxToMm(pos, view);
    const newOffX = pos.x - mmAtCursor.x * newPx;
    const newOffY = pos.y - mmAtCursor.y * newPx;
    setView({ pxPerMm: newPx, offsetX: newOffX, offsetY: newOffY });
  };

  const onContextMenu = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.evt.preventDefault();
    // right-click in trace tool → finish trace if ≥ 2 nodes
    if (tool === 'trace' && draftTrace && draftTrace.nodes.length >= 2) {
      finishTrace();
    }
    // right-click in chain tool → commit all preview holes
    if (tool === 'chain' && chainDraft) {
      const positions = cursorMm
        ? computeChainPositions(chainDraft.startPos, cursorMm)
        : [chainDraft.startPos];
      commitChainPositions(positions);
    }
  };

  return (
    <div ref={containerRef} className="flex-1 relative bg-bg overflow-hidden">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onClick={onStageClick}
        onTap={onStageClick}
        onWheel={onWheel}
        onContextMenu={onContextMenu}
      >
        <GridLayer width={size.width} height={size.height} view={view} gridMm={gridMm} />
        <BoardLayer board={project.board} draft={draftBoard} cursorMm={cursorMm} view={view} selection={selection} />
        <HoleLayer holes={project.holes} selection={selection} view={view} />
        <TraceLayer
          traces={project.traces}
          project={project}
          view={view}
          draftNodes={draftTrace?.nodes ?? []}
          cursorMm={tool === 'trace' ? cursorMm : null}
          selection={selection}
        />
        <ConstraintLayer project={project} view={view} conflictingIds={conflictingIds} selection={selection} />
        <ConstructionLayer
          lines={project.constructionLines}
          draftConstrStart={draftConstrStart}
          cursorMm={tool === 'constr' ? cursorMm : null}
          view={view}
          visible={showConstruction}
          selectedId={selection.kind === 'constr-line' ? selection.id : null}
        />
        <MeasureLayer
          measurePoints={measurePoints}
          cursorMm={tool === 'measure' ? cursorMm : null}
          view={view}
        />
        {tool === 'chain' && chainDraft && (
          <ChainLayer
            startPos={chainDraft.startPos}
            cursorMm={cursorMm}
            view={view}
          />
        )}
      </Stage>
      <CursorOverlay cursorMm={cursorMm} view={view} snapMm={gridMm} />
    </div>
  );
}

// Hit-test traces in pixel space. Returns the first trace id hit, or null.
function findTraceAtPx(
  traces: Trace[],
  project: Project,
  mmClick: Point,
  pxPerMm: number,
): string | null {
  const HALO_MM = (SELECT_HALO_PX + 2) / pxPerMm;
  for (const trace of traces) {
    const pts = resolveTrace(trace, project);
    if (pts.length < 2) continue;
    const halfW = trace.width / 2 + HALO_MM;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      const localT =
        len2 === 0
          ? 0
          : Math.max(0, Math.min(1, ((mmClick.x - a.x) * abx + (mmClick.y - a.y) * aby) / len2));
      const cx = a.x + localT * abx;
      const cy = a.y + localT * aby;
      if (Math.hypot(mmClick.x - cx, mmClick.y - cy) <= halfW) return trace.id;
    }
  }
  return null;
}

function CursorOverlay({
  cursorMm,
  view,
  snapMm,
}: {
  cursorMm: Point | null;
  view: { pxPerMm: number };
  snapMm: number;
}) {
  const displayStep = getAdaptiveGridStep(view.pxPerMm);
  if (!cursorMm) {
    return (
      <div className="absolute bottom-2 right-2 text-xs text-muted bg-panel/80 px-2 py-1 rounded border border-border font-mono">
        grid: {fmtGridStep(displayStep)} &nbsp;|&nbsp; snap: {fmtGridStep(snapMm)}
      </div>
    );
  }
  return (
    <div className="absolute bottom-2 right-2 text-xs text-muted bg-panel/80 px-2 py-1 rounded border border-border font-mono">
      {cursorMm.x.toFixed(2)}, {cursorMm.y.toFixed(2)} mm
      &nbsp;|&nbsp; grid: <span className="text-text">{fmtGridStep(displayStep)}</span>
      &nbsp;|&nbsp; snap: {fmtGridStep(snapMm)}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
