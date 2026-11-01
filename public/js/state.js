// Shared experiment state, plus the pure (DOM-free) reading logic.
import { NOISE_FRACTION, PERCENT } from './constants.js';

export const state = {
  type: 'simple',    // 'simple' | 'compound'
  loads: [],         // [{ W, x }] accepted loads
  rows: [],          // observation-table rows
  broken: false,     // true once the beam has failed
  bodies: [],        // falling bodies of the failure animation
  reading: null,     // current balance reading (N)
  failInfo: null,    // { W, x } of the load that broke the beam
  A: null,           // latest analysis from the server
  config: null,      // physics constants, taken from the latest server response
  beam: null,        // { length, selfWeight } chosen by the user; null = server defaults
  pendingX: null,    // x (m) where the next weight will go; moved by the handle or the x field
  balancePreview: null, // x (m) of roller B while it is being dragged; null when not dragging
  busy: false,       // an Add request is in flight
  requestId: 0,      // id of the newest request; older responses are ignored
};

/** Forget the experiment (loads, table, failure). Keeps the beam type and server data. */
export function clearExperiment() {
  state.loads = [];
  state.rows = [];
  state.broken = false;
  state.bodies = [];
  state.reading = null;
  state.failInfo = null;
}

/** Default measurement noise: a random fraction in [-NOISE_FRACTION / 2, +NOISE_FRACTION / 2). */
export function randomNoise() {
  return (Math.random() - 0.5) * NOISE_FRACTION;
}

/**
 * Build one observation-table row from a server analysis.
 * `noise` is injectable (a function returning a fraction) so readings can be made deterministic.
 */
//change for adding reaction at A in observation table 
// In state.js
export function buildRow(analysis, W, x, noise = randomNoise) {
  // Support B (measured via balance scale with noise)
  const rf = +(analysis.init_bal + analysis.added_bal * (1 + noise())).toFixed(3);
  const rb_exp = +(rf - analysis.init_bal).toFixed(3);
  const rb_anal = +analysis.added_bal.toFixed(3);

  // Support A (calculated by static equilibrium: Total Load - Support B)
  // Assuming analysis provides total vertical load or beam self-weight + added W
  const totalLoad = (analysis.total_load !== undefined) ? analysis.total_load : (W + (analysis.self_weight || 4));
  const ra_anal = +(totalLoad - rb_anal).toFixed(3);
  const ra_exp = +(totalLoad - rb_exp).toFixed(3);

  // Percentage errors for both supports
  const erB = Math.abs((rb_anal - rb_exp) / rb_anal) * PERCENT;
  const erA = Math.abs((ra_anal - ra_exp) / ra_anal) * PERCENT;
  const meanError = +((erA + erB) / 2).toFixed(2);

  return {
    W,
    x,
    ra_exp,
    ra_anal,
    rb_exp,
    rb_anal,
    er: meanError,
  };
}
