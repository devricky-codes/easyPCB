import { useEffect } from 'react';
import { Toolbar } from './ui/Toolbar';
import { Sidebar } from './ui/Sidebar';
import { CanvasRoot } from './canvas/CanvasRoot';
import { useStore } from './model/store';

export default function App() {
  const setTool = useStore((s) => s.setTool);
  const tool = useStore((s) => s.tool);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      // undo / redo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        redo();
        return;
      }
      // tool shortcuts
      if (e.key === 'v' || e.key === 'V') setTool('select');
      else if (e.key === 'b' || e.key === 'B') setTool('board');
      else if (e.key === 'h' || e.key === 'H') setTool('hole');
      else if (e.key === 't' || e.key === 'T') setTool('trace');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool, undo, redo]);

  return (
    <div className="h-full flex flex-col">
      <Toolbar />
      <div className="flex-1 flex min-h-0">
        <CanvasRoot />
        <Sidebar />
      </div>
      <StatusBar tool={tool} />
    </div>
  );
}

function StatusBar({ tool }: { tool: string }) {
  return (
    <div className="text-xs text-muted px-3 py-1 border-t border-border bg-panel flex justify-between">
      <span>tool: {tool}</span>
      <span>V select · B board · H hole · T trace · Ctrl+Z undo · Ctrl+Y redo · scroll = zoom · middle/right drag = pan</span>
    </div>
  );
}
