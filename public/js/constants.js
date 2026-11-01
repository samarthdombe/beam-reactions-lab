// UI and drawing constants only.
// Physics constants (length, hinge, self-weight, load limits, grid size...) are NOT defined
// here: the server sends them in the `config` object of every /api/analyze response.

export const API_URL = '/api/analyze';

// --- Canvas geometry (pixels) ---
export const BEAM_LEFT_PX = 60;     // x of the beam's left end
export const BEAM_PX = 780;         // drawn length of the whole beam
export const BEAM_TOP = 196;        // y of the beam's top edge
export const BEAM_THICKNESS = 22;   // drawn beam depth
export const GROUND_Y = 282;        // y of the bench surface
export const BENCH_HEIGHT = 48;

// --- Draggable load-position handle ---
export const HANDLE_Y = 58;            // y of the handle's centre (above the beam and any load blocks)
export const HANDLE_RADIUS = 11;
export const HANDLE_HIT_PADDING = 8;   // extra pixels around the handle that still grab it
export const HANDLE_COLOR = '#2563eb';
export const X_RESOLUTION = 100;       // the handle snaps to 1 / X_RESOLUTION metres (0.01 m)
export const SNAP_TOLERANCE = 1e-9;    // absorbs floating-point noise when rounding limits inward

// --- Draggable middle support (roller B on the compound beam) ---
export const BALANCE_HIT_HALF_WIDTH = 54;  // pixels either side of the support that still grab it
export const BALANCE_HIT_BELOW = 28;       // pixels below the bench surface (covers the scale display)
export const BALANCE_ARROW_OFFSET = 46;    // distance of the drag arrows from the support centre
export const DRAG_THRESHOLD = 3;           // pixels the pointer must move before a press counts as a drag

// --- Load blocks ---
export const LOAD_WIDTH = 36;
export const LOAD_BASE_HEIGHT = 16;
export const LOAD_HEIGHT_PER_N = 0.3;

// --- Wood grain ---
export const GRAIN_WAVE_FREQ = 0.4;
export const GRAIN_LINES = [0.3, 0.55, 0.8];

// --- Equilibrium check ---
// |ΣF| (N) and |ΣM| (N·m) below this count as zero (absorbs floating-point rounding).
export const EQUILIBRIUM_TOLERANCE = 1e-6;
