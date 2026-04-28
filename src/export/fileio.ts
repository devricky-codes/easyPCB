// Save / Load project JSON using the browser File API.
import type { Project } from '../model/types';

/** Serialises the project and triggers a browser download as .easypcb.json */
export function saveProjectJson(project: Project, filename = 'project.easypcb.json'): void {
  const json = JSON.stringify({ version: 1, project }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Opens a file-picker, reads the chosen .easypcb.json file, and resolves with the Project. */
export function loadProjectJson(): Promise<Project> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.easypcb.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const raw = JSON.parse(e.target?.result as string) as unknown;
          if (typeof raw !== 'object' || raw === null || !('project' in raw)) {
            reject(new Error('Invalid project file'));
            return;
          }
          resolve((raw as { project: Project }).project);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    };
    input.click();
  });
}
