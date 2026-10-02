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
export function buildRow(analysis, W, x, noise = randomNoise) {
  const rf = +(analysis.init_bal + analysis.added_bal * (1 + noise())).toFixed(3);
  const re = +(rf - analysis.init_bal).toFixed(3);
  return {
    W,
    x,
    ri: +analysis.init_bal.toFixed(3),
    rf,
    re,
    ra: +analysis.added_bal.toFixed(3),
    er: Math.abs((analysis.added_bal - re) / analysis.added_bal) * PERCENT,
  };
}
