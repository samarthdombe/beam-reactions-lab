// DOM panels (live values, table, conclusion), config consumer, and the Add / Reset flows.
import { analyze, ApiError } from './api.js';
import { MEAN_ERROR_LIMIT, PERCENT, SNAP_TOLERANCE, X_RESOLUTION } from './constants.js';
import { animateFailure, draw, prepareFailure } from './render.js';
import { buildRow, clearExperiment, randomNoise, state } from './state.js';

const $ = (id) => document.getElementById(id);

export const BACKEND_MESSAGE =
  'Python backend not reachable. Run "python scripts/run_local.py" or "vercel dev" locally, or deploy to Vercel.';

export function msg(text) {
  $('msg').textContent = text || '';
}

/** A 400 carries the server's own explanation; anything else means the backend is not reachable. */
function errorText(error) {
  return error instanceof ApiError && error.status === 400 ? error.message : BACKEND_MESSAGE;
}

// ---- config consumer: physics constants from the server response ----

/** Show the server's constants in the Live values panel and as input limits. */
function applyConfig(config) {
  $('cfgL').textContent = config.L.toFixed(2) + ' m';
  $('cfgSelfWeight').textContent = config.selfWeight.toFixed(2) + ' N';
  $('cfgWMax').textContent = config.wMax + ' N';
  $('W').min = config.wMin;
  $('W').max = config.wMax;
  $('X').min = config.xMin;
  $('X').max = config.xMax;
  $('beamL').min = config.lMin;
  $('beamL').max = config.lMax;
  $('beamL').value = config.L;
  $('beamSW').min = config.selfWeightMin;
  $('beamSW').max = config.selfWeightMax;
  $('beamSW').value = config.selfWeight;
}

// ---- load-position handle (the x field and the draggable handle stay in sync) ----

/** Round x to a multiple of 1/X_RESOLUTION metres that lies inside the server's range [min, max]. */
function snapWithin(x, min, max) {
  const lo = Math.ceil(min * X_RESOLUTION - SNAP_TOLERANCE) / X_RESOLUTION;
  const hi = Math.floor(max * X_RESOLUTION + SNAP_TOLERANCE) / X_RESOLUTION;
  return Math.min(hi, Math.max(lo, Math.round(x * X_RESOLUTION) / X_RESOLUTION));
}

/** Snap a load position to the handle's resolution, inside the accepted range. */
function snapX(x) {
  return snapWithin(x, state.config.xMin, state.config.xMax);
}

/** Move the handle and the x field to x (no redraw). */
function placeHandle(x) {
  state.pendingX = snapX(x);
  $('X').value = state.pendingX.toFixed(2);
}

/** Move the handle (dragging) and redraw. */
export function setPendingX(x) {
  placeHandle(x);
  draw();
}

// ---- middle support (roller B of the compound beam) ----

/** Show roller B at x while it is being dragged (the server is asked only when it is released). */
export function setBalancePreview(x) {
  state.balancePreview = snapWithin(x, state.config.xbMin, state.config.xbMax);
  draw();
}

/** The drag was a plain click, or was abandoned: put roller B back. */
export function cancelBalancePreview() {
  state.balancePreview = null;
  draw();
}

/**
 * Roller B was released at a new position. Readings taken with B somewhere else no longer
 * apply, so the experiment restarts on the new layout.
 */
export function commitBalance() {
  const x = state.balancePreview;
  state.balancePreview = null;
  if (x === null || Math.abs(x - state.config.xb) < SNAP_TOLERANCE) return draw();
  const { length, selfWeight } = state.beam ?? { length: state.config.L, selfWeight: state.config.selfWeight };
  state.beam = { length, selfWeight, balanceX: x };
  return resetExperiment();
}

/** The x field was edited by hand: move the handle to match, leaving what was typed alone. */
export function syncHandleFromInput() {
  const text = $('X').value;
  if (text === '' || !Number.isFinite(+text)) return;
  state.pendingX = +text;
  draw();
}

/** Adopt a server analysis as the current one. */
function acceptAnalysis(analysis) {
  state.A = analysis;
  state.config = analysis.config;
  applyConfig(analysis.config);
  if (state.pendingX === null) placeHandle(analysis.config.L / 2); // starts at the midpoint
}

// ---- panels ----

function renderTable() {
  $('tb').innerHTML = state.rows.length
    ? state.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.W.toFixed(2)}</td><td>${r.x.toFixed(2)}</td><td>${r.ri.toFixed(3)}</td><td>${r.rf.toFixed(3)}</td><td>${r.re.toFixed(3)}</td><td>${r.ra.toFixed(3)}</td><td>${r.er.toFixed(2)}</td></tr>`).join('')
    : '<tr><td colspan="8" class="muted" style="text-align:center">No readings yet. Add a weight to begin.</td></tr>';
}

function renderConclusion() {
  const { A, rows, loads, broken, failInfo } = state;
  let html = '<p>Add weights to generate the conclusion.</p>';
  if (rows.length) {
    const n = rows.length;
    const mean = rows.reduce((sum, r) => sum + r.er, 0) / n;
    const last = rows[n - 1];
    const residual = last.re - last.ra;
    const ok = mean < MEAN_ERROR_LIMIT;
    const total = A.self_w + loads.reduce((sum, v) => sum + v.W, 0) - (broken ? failInfo.W : 0);
    html = `<p>Over ${n} reading${n > 1 ? 's' : ''}, the mean percentage error is <b>${mean.toFixed(2)}%</b>. For the latest reading the force residual is ΣF<sub>y</sub> = ${residual.toFixed(3)} N and the moment residual about the left support is ΣM = ${(residual * A.xb).toFixed(3)} N·m (total load with self-weight: ${total.toFixed(2)} N).</p>
  <p class="${ok ? 'ok' : 'bad'}"><b>${ok ? 'The beam is in static equilibrium: ΣF = 0 and ΣM = 0 hold within experimental error, so the moment law is verified.' : 'The residuals are larger than expected (mean error above 5%). Recheck the readings before concluding equilibrium.'}</b></p>`;
  }
  if (broken) {
    html += `<p class="bad">The beam failed when ${failInfo.W.toFixed(1)} N was added at x = ${failInfo.x.toFixed(2)} m. The conclusion uses only readings recorded before failure.</p>`;
  }
  $('ctext').innerHTML = html;
}

/** Redraw every panel and the canvas from the current state. */
export function refresh() {
  const { A } = state;
  if (!A) return;
  $('tot').textContent = A.total.toFixed(2) + ' N';
  $('mm').textContent = A.M.toFixed(2) + ' N·m';
  $('sg').textContent = (A.sigma / 1e6).toFixed(1) + ' MPa';
  $('sbar').style.width = Math.min(PERCENT, A.s * PERCENT) + '%';
  renderTable();
  renderConclusion();
  draw();
}

// ---- flows ----

function fail() {
  state.broken = true;
  $('alert').style.display = 'block';
  prepareFailure();
  refresh();
  $('sbar').style.width = PERCENT + '%';
  animateFailure();
}

/**
 * Validate the inputs, ask the server for the new analysis, record a reading.
 * `noise` (a function returning a fraction) is injectable to make readings deterministic.
 */
export async function addLoad({ noise = randomNoise } = {}) {
  if (state.broken) return msg('The beam has failed. Press Reset to start again.');
  if (state.busy) return;
  const W = +$('W').value;
  const x = +$('X').value;
  const limits = state.config; // unknown until the first server response; the server validates too
  if (limits) {
    if (!(W >= limits.wMin && W <= limits.wMax)) return msg(`Enter a weight between ${limits.wMin} and ${limits.wMax} N.`);
    if (!(x >= limits.xMin && x <= limits.xMax)) return msg(`Enter a distance between ${limits.xMin} and ${limits.xMax} m.`);
  }
  msg();
  state.busy = true;
  const id = ++state.requestId;
  try {
    const analysis = await analyze(state.type, state.loads.concat({ W, x }), state.beam);
    if (id !== state.requestId) return; // superseded by a Reset or beam-type change: drop the stale result
    state.loads.push({ W, x });
    acceptAnalysis(analysis);
    if (analysis.s >= 1) {
      state.failInfo = { W, x };
      return fail();
    }
    const row = buildRow(analysis, W, x, noise);
    state.rows.push(row);
    state.reading = row.rf;
    refresh();
  } catch (e) {
    if (id !== state.requestId) return;
    msg(errorText(e));
  } finally {
    if (id === state.requestId) state.busy = false;
  }
}

/** Clear the experiment and load a fresh unloaded beam from the server. */
export async function resetExperiment() {
  clearExperiment();
  state.busy = false; // an in-flight Add is superseded below, so it must not block new ones
  const id = ++state.requestId;
  $('alert').style.display = 'none';
  msg();
  $('sbar').style.width = '0';
  try {
    const analysis = await analyze(state.type, [], state.beam);
    if (id !== state.requestId) return; // a newer request owns the screen now
    acceptAnalysis(analysis);
    refresh();
  } catch (e) {
    if (id !== state.requestId) return;
    msg(errorText(e));
    draw();
  }
}

/** The length or self-weight field changed: validate, then restart the experiment on the new beam. */
export function changeBeam() {
  const lengthText = $('beamL').value;
  const weightText = $('beamSW').value;
  const length = +lengthText;
  const selfWeight = +weightText;
  const c = state.config; // unknown until the first server response; the server validates too
  if (c) {
    const restore = () => {
      $('beamL').value = c.L;
      $('beamSW').value = c.selfWeight;
    };
    if (lengthText === '' || !(length >= c.lMin && length <= c.lMax)) {
      restore();
      return msg(`Enter a beam length between ${c.lMin} and ${c.lMax} m.`);
    }
    if (weightText === '' || !(selfWeight >= c.selfWeightMin && selfWeight <= c.selfWeightMax)) {
      restore();
      return msg(`Enter a self-weight between ${c.selfWeightMin} and ${c.selfWeightMax} N.`);
    }
    if (length === c.L && selfWeight === c.selfWeight) return msg();
  }
  state.beam = { length, selfWeight };
  // Loads placed on the old beam may not fit the new one, so the experiment restarts
  // with the handle back at the new midpoint.
  state.pendingX = Math.round((length / 2) * X_RESOLUTION) / X_RESOLUTION;
  $('X').value = state.pendingX.toFixed(2);
  return resetExperiment();
}

export function changeBeamType(type) {
  state.type = type;
  $('ctitle').textContent = 'Simulation: ' + type + ' beam';
  return resetExperiment();
}
