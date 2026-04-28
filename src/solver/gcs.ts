// planegcs WASM loader. Singleton. Lazy init.
//
// API summary (planegcs 1.1.x):
//   make_gcs_wrapper(wasmUrl?) -> Promise<GcsWrapper>
//   wrapper.push_primitives_and_params(primitives[])
//   wrapper.solve() -> SolveStatus (0 = Success)
//   wrapper.apply_solution()  // commits solution back to sketch_index
//   wrapper.sketch_index.get_primitives()
//   wrapper.clear_data()
//
// Vite handles the .wasm file via `?url` import so it's served as an asset.

import { make_gcs_wrapper, SolveStatus, type GcsWrapper } from '@salusoft89/planegcs';
import wasmUrl from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';

let wrapperPromise: Promise<GcsWrapper> | null = null;

export async function getGcs(): Promise<GcsWrapper> {
  if (!wrapperPromise) {
    wrapperPromise = make_gcs_wrapper(wasmUrl);
  }
  return wrapperPromise;
}

// Self-test: two points 10mm apart, anchor first point, solve.
// Returns formatted result string for the verify panel.
export async function verifyPlanegcs(): Promise<string> {
  try {
    const gcs = await getGcs();
    gcs.clear_data();

    gcs.push_primitives_and_params([
      { id: '1', type: 'point', x: 0, y: 0, fixed: true },
      { id: '2', type: 'point', x: 5, y: 0, fixed: false },
      { id: 'c1', type: 'p2p_distance', p1_id: '1', p2_id: '2', distance: 10 }
    ]);

    const status = gcs.solve();
    gcs.apply_solution();

    const updated = gcs.sketch_index.get_primitives();
    const p2 = updated.find((p) => p.id === '2') as { x: number; y: number } | undefined;
    const dist = p2 ? Math.hypot(p2.x, p2.y) : NaN;

    const statusName =
      status === SolveStatus.Success
        ? 'Success'
        : status === SolveStatus.Converged
          ? 'Converged'
          : status === SolveStatus.Failed
            ? 'Failed'
            : 'SuccessfulSolutionInvalid';

    const pass = (status === SolveStatus.Success || status === SolveStatus.Converged) && Math.abs(dist - 10) < 0.01;

    return [
      `status: ${statusName} (${status})`,
      `point 2 -> (${p2?.x.toFixed(3)}, ${p2?.y.toFixed(3)})`,
      `distance: ${dist.toFixed(3)} mm (expected 10.000)`,
      pass ? 'PASS' : 'FAIL'
    ].join('\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return 'ERROR: ' + msg;
  }
}
