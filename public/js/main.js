// Entry point: wire the page controls to the experiment flows.
import { exportPdf } from './report.js';
import { addLoad, changeBeamType, msg, resetExperiment } from './ui.js';

const $ = (id) => document.getElementById(id);

$('add').onclick = () => addLoad();
$('reset').onclick = () => resetExperiment();
$('pdf').onclick = () => exportPdf(msg);
$('type').onchange = (e) => changeBeamType(e.target.value);
['W', 'X'].forEach((id) => $(id).addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addLoad();
}));

resetExperiment();
