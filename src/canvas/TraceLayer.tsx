import { Layer, Line, Circle } from 'react-konva';
import type { Project, Selection, Trace, TraceNode } from '../model/types';
import type { Viewport } from './viewport';
import { mmToPx } from './viewport';
import { resolveNodePosition, resolveTrace } from '../model/traceUtils';

type Props = {
  traces: Trace[];
  project: Project;
  view: Viewport;
  /** Committed nodes of the in-progress draft trace (resolved to Points are done
   *  inside by looking them up in project). Raw TraceNode[] so we can call resolveNodePosition. */
  draftNodes: TraceNode[];
  /** Current cursor position in mm (for rubber-band). */
  cursorMm: { x: number; y: number } | null;
  selection: Selection;
};

export function TraceLayer({ traces, project, view, draftNodes, cursorMm, selection }: Props) {
  // Resolve draft node positions once
  const draftPts = draftNodes
    .map((n) => resolveNodePosition(n, project))
    .filter((p): p is { x: number; y: number } => p !== null);

  return (
    <Layer listening={false}>
      {/* Committed traces */}
      {traces.map((trace) => {
        const pts = resolveTrace(trace, project);
        if (pts.length < 2) return null;
        const flatPx = pts.flatMap((p) => {
          const px = mmToPx(p, view);
          return [px.x, px.y];
        });
        const isSelected = selection.kind === 'trace' && selection.id === trace.id;
        const strokePx = Math.max(1.5, trace.width * view.pxPerMm);
        return (
          <Line
            key={trace.id}
            points={flatPx}
            stroke={isSelected ? '#60a5fa' : '#4ade80'}
            strokeWidth={strokePx}
            lineCap="round"
            lineJoin="round"
          />
        );
      })}

      {/* Draft — committed segments */}
      {draftPts.length >= 2 && (
        <Line
          points={draftPts.flatMap((p) => {
            const px = mmToPx(p, view);
            return [px.x, px.y];
          })}
          stroke="#fbbf24"
          strokeWidth={2}
          lineCap="round"
          lineJoin="round"
        />
      )}

      {/* Draft — rubber-band to cursor */}
      {draftPts.length >= 1 && cursorMm && (() => {
        const last = mmToPx(draftPts[draftPts.length - 1], view);
        const cur = mmToPx(cursorMm, view);
        return (
          <Line
            points={[last.x, last.y, cur.x, cur.y]}
            stroke="#fbbf24"
            strokeWidth={1}
            dash={[5, 5]}
            lineCap="round"
            opacity={0.7}
          />
        );
      })()}

      {/* Draft — node dots */}
      {draftPts.map((p, i) => {
        const px = mmToPx(p, view);
        return <Circle key={i} x={px.x} y={px.y} radius={3} fill="#fbbf24" />;
      })}
    </Layer>
  );
}
