// Gerber RS-274X + Excellon drill exporter.
// Board Y-axis is Y-down (screen space). Gerber uses Y-up, so we flip Y on export.
// Coordinate units: 10^-6 mm (1 nm precision) for Gerber, 10^-3 mm for Excellon.

import JSZip from 'jszip';
import type { Project } from '../model/types';
import { resolveTrace } from '../model/traceUtils';

// ─── coordinate helpers ───────────────────────────────────────────────────────

/** Gerber X coordinate: 4 integer + 6 decimal digits, no decimal point. */
function gx(mm: number): string {
  return Math.round(mm * 1e6).toString();
}

/** Gerber Y coordinate: flips Y-axis (model = Y-down, Gerber = Y-up). */
function gy(mm: number): string {
  return Math.round(-mm * 1e6).toString();
}

/** Excellon coordinate: explicit decimal point, 3 decimal places, metric. */
function ex(mm: number): string {
  return mm.toFixed(3);
}

function ey(mm: number): string {
  return (-mm).toFixed(3);
}

// ─── DRL (Excellon drill file) ────────────────────────────────────────────────

export function buildDrlFile(project: Project): string {
  if (project.holes.length === 0) {
    return 'M48\nFMAT,2\nMETRIC\n%\nM30\n';
  }

  // Group unique diameters → tool numbers (sorted ascending)
  const diameters = [...new Set(project.holes.map((h) => h.diameter))].sort((a, b) => a - b);
  const toolMap = new Map(diameters.map((d, i) => [d, i + 1]));

  const lines: string[] = [];
  lines.push('M48');
  lines.push('FMAT,2');      // use explicit decimal-point format
  lines.push('METRIC');     // metric units, decimal-point coords
  for (const [d, t] of toolMap) {
    lines.push(`T${t}C${d.toFixed(4)}`);
  }
  lines.push('%'); // end header

  for (const d of diameters) {
    const t = toolMap.get(d)!;
    lines.push(`T${t}`);
    for (const hole of project.holes.filter((h) => h.diameter === d)) {
      lines.push(`X${ex(hole.position.x)}Y${ey(hole.position.y)}`);
    }
  }
  lines.push('M30');
  return lines.join('\n') + '\n';
}

// ─── GTL (top copper Gerber) ──────────────────────────────────────────────────

const GTL_HEADER = `%FSLAX46Y46*%
%MOMM*%
%LPD*%
G01*
`;

const GTL_FOOTER = 'M02*\n';

export function buildGtlFile(project: Project): string {
  const lines: string[] = [GTL_HEADER.trimEnd()];

  // --- Aperture definitions ---
  // pad holes: annular ring = hole + 0.6 mm (0.3 mm ring)
  // via holes: annular ring = hole + 0.2 mm (0.1 mm ring)
  // mount holes: no copper pad — skipped entirely
  const padHoles = project.holes.filter((h) => (h.kind ?? 'pad') === 'pad');
  const viaHoles = project.holes.filter((h) => h.kind === 'via');

  const padDiameters = [...new Set(padHoles.map((h) => h.diameter))].sort((a, b) => a - b);
  const viaDiameters = [...new Set(viaHoles.map((h) => h.diameter))].sort((a, b) => a - b);

  const padApertureMap = new Map<number, number>(); // holeDiameter → aperture number
  const viaApertureMap = new Map<number, number>();
  let apertureNum = 10;

  for (const d of padDiameters) {
    const padDiam = (d + 0.6).toFixed(4);
    lines.push(`%ADD${apertureNum}C,${padDiam}*%`);
    padApertureMap.set(d, apertureNum++);
  }
  for (const d of viaDiameters) {
    const viaDiam = (d + 0.2).toFixed(4);
    lines.push(`%ADD${apertureNum}C,${viaDiam}*%`);
    viaApertureMap.set(d, apertureNum++);
  }

  // Trace apertures: one per unique width
  const traceWidths = [...new Set(project.traces.map((t) => t.width))].sort((a, b) => a - b);
  const traceApertureMap = new Map<number, number>(); // width → aperture number
  for (const w of traceWidths) {
    lines.push(`%ADD${apertureNum}C,${w.toFixed(4)}*%`);
    traceApertureMap.set(w, apertureNum++);
  }

  lines.push('');

  // --- Pads: flash copper ring at each pad-kind hole ---
  for (const d of padDiameters) {
    const ap = padApertureMap.get(d)!;
    lines.push(`D${ap}*`);
    for (const hole of padHoles.filter((h) => h.diameter === d)) {
      lines.push(`X${gx(hole.position.x)}Y${gy(hole.position.y)}D03*`);
    }
  }

  // --- Vias: flash small annular ring at each via-kind hole ---
  for (const d of viaDiameters) {
    const ap = viaApertureMap.get(d)!;
    lines.push(`D${ap}*`);
    for (const hole of viaHoles.filter((h) => h.diameter === d)) {
      lines.push(`X${gx(hole.position.x)}Y${gy(hole.position.y)}D03*`);
    }
  }
  // mount holes have no copper pad — intentionally omitted

  // --- Traces ---
  for (const trace of project.traces) {
    const pts = resolveTrace(trace, project);
    if (pts.length < 2) continue;
    const ap = traceApertureMap.get(trace.width)!;
    lines.push(`D${ap}*`);
    lines.push(`X${gx(pts[0].x)}Y${gy(pts[0].y)}D02*`); // move to start
    for (let i = 1; i < pts.length; i++) {
      lines.push(`X${gx(pts[i].x)}Y${gy(pts[i].y)}D01*`); // draw
    }
  }

  lines.push(GTL_FOOTER.trimEnd());
  return lines.join('\n') + '\n';
}

// ─── GKO (board outline Gerber) ───────────────────────────────────────────────

const GKO_HEADER = `%FSLAX46Y46*%
%MOMM*%
%LPD*%
%ADD10C,0.05*%
G01*
`;

const GKO_FOOTER = 'M02*\n';

export function buildGkoFile(project: Project): string {
  if (!project.board || project.board.vertices.length < 3) {
    return GKO_HEADER + GKO_FOOTER;
  }

  const { vertices } = project.board;
  const lines: string[] = [GKO_HEADER.trimEnd(), 'D10*'];

  // Move to first vertex, then draw each edge, close back to first
  lines.push(`X${gx(vertices[0].x)}Y${gy(vertices[0].y)}D02*`);
  for (let i = 1; i < vertices.length; i++) {
    lines.push(`X${gx(vertices[i].x)}Y${gy(vertices[i].y)}D01*`);
  }
  // Close outline
  lines.push(`X${gx(vertices[0].x)}Y${gy(vertices[0].y)}D01*`);

  lines.push(GKO_FOOTER.trimEnd());
  return lines.join('\n') + '\n';
}

// ─── Zip bundle ───────────────────────────────────────────────────────────────

/** Builds a zip containing board.DRL, board.GTL, board.GKO and triggers browser download. */
export async function downloadGerberZip(project: Project, filename = 'gerber.zip'): Promise<void> {
  const zip = new JSZip();
  zip.file('board.DRL', buildDrlFile(project));
  zip.file('board.GTL', buildGtlFile(project));
  zip.file('board.GKO', buildGkoFile(project));

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  triggerDownload(blob, filename);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
