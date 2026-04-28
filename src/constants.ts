// All physical dimensions in mm. View transforms convert to/from screen px.

export const DEFAULT_GRID_MM = 1.0;
export const DEFAULT_HOLE_DIAMETER_MM = 0.8;
export const DEFAULT_TRACE_WIDTH_MM = 0.25;

export const INITIAL_PX_PER_MM = 10;
export const MIN_PX_PER_MM = 1;
export const MAX_PX_PER_MM = 400;
export const ZOOM_STEP = 1.15;

export const HOLE_RING_PX = 2; // visual ring thickness (screen px, not mm)
export const SELECT_HALO_PX = 3;

/** Standard 0.1" DIP / pin-header pitch in mm. */
export const CHAIN_PITCH_MM = 2.54;

// ─── Feature flags ────────────────────────────────────────────────────────────
// Set a flag to `true` to enable the corresponding experimental feature.
export const FEATURES = {
  /** Auto-route a selected trace away from obstacles (A* on a 0.25 mm grid). */
  unentangle: true,
  /** Draggable leader-line labels on holes and traces. */
  labels: true,
} as const;
