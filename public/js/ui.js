// DOM panels (live values, table, conclusion), config consumer, and the Add / Reset flows.
import { analyze, ApiError } from './api.js';
import { MEAN_ERROR_LIMIT, PERCENT } from './constants.js';
import { animateFailure, draw, prepareFailure } from './render.js';
import { buildRow, clearExperiment, randomNoise, state } from './state.js';

const $ = (id) => document.getElementById(id);

export const BACKEND_MESSAGE =
  'Python backend not reachable. Run "python scripts/run_local.py" or "vercel dev" locally, or deploy to Vercel.';

export function msg(text) {
  $('msg').textContent = text || '';
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
}

/** Adopt a server analysis as the current one. */
function acceptAnalysis(analysis) {
  state.A = analysis;
  state.config = analysis.config;
  applyConfig(analysis.config);
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
    const analysis = await analyze(state.type, state.loads.concat({ W, x }));
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
    msg(e instanceof ApiError && e.status < 500 ? e.message : BACKEND_MESSAGE);
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
    const analysis = await analyze(state.type, []);
    if (id !== state.requestId) return; // a newer request owns the screen now
    acceptAnalysis(analysis);
    refresh();
  } catch (e) {
    if (id !== state.requestId) return;
    msg(BACKEND_MESSAGE);
    draw();
  }
}

export function changeBeamType(type) {
  state.type = type;
  $('ctitle').textContent = 'Simulation: ' + type + ' beam';
  return resetExperiment();
}
