// PDF export of the report section. html2pdf is a classic <script> loaded from a CDN.

/** `showMessage(text)` is called if the export fails. */
export function exportPdf(showMessage) {
  document.body.classList.add('exp');
  html2pdf().set({
    margin: 8,
    filename: 'beam-experiment-report.pdf',
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, backgroundColor: '#eaf2ff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all'] },
  }).from(document.getElementById('report')).save()
    .then(() => document.body.classList.remove('exp'))
    .catch(() => {
      document.body.classList.remove('exp');
      showMessage('PDF export failed. Check your internet connection (html2pdf loads from a CDN).');
    });
}
