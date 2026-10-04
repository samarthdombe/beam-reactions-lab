// Entry point: wire the page controls to the experiment flows.
import { initHandle } from './handle.js';
import { exportPdf } from './report.js';
import {
  addLoad, changeBeam, changeBeamType, msg, resetExperiment, syncHandleFromInput,
} from './ui.js';

const $ = (id) => document.getElementById(id);

$('add').onclick = () => addLoad();
$('reset').onclick = () => resetExperiment();
$('pdf').onclick = () => exportPdf(msg);
$('type').onchange = (e) => changeBeamType(e.target.value);
$('beamL').onchange = () => changeBeam();
$('beamSW').onchange = () => changeBeam();
$('X').addEventListener('input', syncHandleFromInput);
['W', 'X'].forEach((id) => $(id).addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addLoad();
}));

initHandle();
resetExperiment();
