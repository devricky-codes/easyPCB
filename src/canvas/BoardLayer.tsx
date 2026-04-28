import { Layer, Line, Circle } from 'react-konva';
import type { Board, Point, Selection } from '../model/types';
import type { Viewport } from './viewport';
import { mmToPx } from './viewport';

type Props = {
  board: Board | null;
  draft: { vertices: Point[] } | null;
  cursorMm: Point | null;
  view: Viewport;
  selection: Selection;
};

export function BoardLayer({ board, draft, cursorMm, view, selection }: Props) {
  return (
    <Layer listening={false}>
      {board && <BoardOutline board={board} view={view} selection={selection} />}
      {draft && <DraftOutline draft={draft} cursorMm={cursorMm} view={view} />}
    </Layer>
  );
}

function BoardOutline({ board, view, selection }: { board: Board; view: Viewport; selection: Selection }) {
  const n = board.vertices.length;

  // Build per-edge lines so we can highlight the selected edge
  const edges = Array.from({ length: n }, (_, i) => {
    const a = mmToPx(board.vertices[i], view);
    const b = mmToPx(board.vertices[(i + 1) % n], view);
    const isSelected = selection.kind === 'board-edge' && selection.edgeIndex === i;
    return (
      <Line
        key={i}
        points={[a.x, a.y, b.x, b.y]}
        stroke={isSelected ? '#ff9f3f' : '#e0c060'}
        strokeWidth={isSelected ? 3 : 2}
      />
    );
  });

  // Vertex dots — render last so they appear on top of edges
  const verts = board.vertices.map((v, i) => {
    const p = mmToPx(v, view);
    const isSelected = selection.kind === 'board-vertex' && selection.vertexIndex === i;
    return (
      <Circle
        key={i}
        x={p.x}
        y={p.y}
        radius={isSelected ? 5 : 2.5}
        fill={isSelected ? '#ff9f3f' : '#e0c060'}
        stroke={isSelected ? '#fff' : undefined}
        strokeWidth={isSelected ? 1 : 0}
      />
    );
  });

  return <>{edges}{verts}</>;
}

function DraftOutline({
  draft,
  cursorMm,
  view
}: {
  draft: { vertices: Point[] };
  cursorMm: Point | null;
  view: Viewport;
}) {
  if (draft.vertices.length === 0 && !cursorMm) return null;

  const verts = [...draft.vertices];
  const flat = verts.flatMap((v) => {
    const p = mmToPx(v, view);
    return [p.x, p.y];
  });

  const rubberPoints =
    cursorMm && verts.length > 0
      ? (() => {
          const last = mmToPx(verts[verts.length - 1], view);
          const cur = mmToPx(cursorMm, view);
          return [last.x, last.y, cur.x, cur.y];
        })()
      : null;

  return (
    <>
      {flat.length >= 4 && <Line points={flat} stroke="#e0c060" strokeWidth={2} dash={[6, 4]} />}
      {rubberPoints && (
        <Line points={rubberPoints} stroke="#e0c060" strokeWidth={1} dash={[3, 3]} opacity={0.7} />
      )}
      {verts.map((v, i) => {
        const p = mmToPx(v, view);
        const first = i === 0;
        return (
          <Circle
            key={i}
            x={p.x}
            y={p.y}
            radius={first ? 6 : 3}
            fill={first ? '#4ea1ff' : '#e0c060'}
            stroke={first ? '#fff' : undefined}
            strokeWidth={first ? 1 : 0}
          />
        );
      })}
    </>
  );
}
