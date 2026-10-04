// UI and drawing constants only.
// Physics constants (length, hinge, self-weight, load limits, grid size...) are NOT defined
// here: the server sends them in the `config` object of every /api/analyze response.

export const API_URL = '/api/analyze';
export const PERCENT = 100;

// --- Canvas geometry (pixels) ---
export const BEAM_LEFT_PX = 60;     // x of the beam's left end
export const BEAM_PX = 780;         // drawn length of the whole beam
export const BEAM_TOP = 196;        // y of the beam's top edge
export const BEAM_THICKNESS = 22;   // drawn beam depth
export const GROUND_Y = 282;        // y of the bench surface
export const BENCH_HEIGHT = 48;

// Pixels drawn per mm of computed deflection (exaggerated so bending is visible)
export const DEFLECTION_SCALE = { simple: 0.3, compound: 2.5 };

// --- Draggable load-position handle ---
export const HANDLE_Y = 58;            // y of the handle's centre (above the beam and any load blocks)
export const HANDLE_RADIUS = 11;
export const HANDLE_HIT_PADDING = 8;   // extra pixels around the handle that still grab it
export const HANDLE_COLOR = '#2563eb';
export const X_RESOLUTION = 100;       // the handle snaps to 1 / X_RESOLUTION metres (0.01 m)
export const SNAP_TOLERANCE = 1e-9;    // absorbs floating-point noise when rounding limits inward

// --- Load blocks ---
export const LOAD_WIDTH = 36;
export const LOAD_BASE_HEIGHT = 16;
export const LOAD_HEIGHT_PER_N = 0.3;

// --- Cracks and wood grain ---
export const CRACK_ONSET = 0.7;        // utilisation (s) at which cracks start to show
export const CRACK_RANGE = 0.3;        // utilisation span over which cracks grow to full size
export const GRAIN_WAVE_FREQ = 0.4;
export const GRAIN_LINES = [0.3, 0.55, 0.8];
export const CRACK_JITTER = 0.4;       // random-looking sideways wobble of each crack segment

// --- Failure animation ---
export const GRAVITY = 0.35;
export const BEAM_HALF_DRIFT = 0.6;    // sideways speed of the two broken halves
export const BEAM_HALF_SPIN = 0.012;
export const OFFSCREEN_MARGIN = 120;

// --- Measurement model ---
// Simulated balance noise: the reading of the added load varies by +/- NOISE_FRACTION / 2.
export const NOISE_FRACTION = 0.04;
// Mean percentage error below which the conclusion reports "equilibrium verified".
export const MEAN_ERROR_LIMIT = 5;
