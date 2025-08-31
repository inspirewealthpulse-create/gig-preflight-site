const { ipcRenderer } = require('electron');

document.getElementById('scan').addEventListener('click', async () => {
  const license = document.getElementById('license').value.trim();
  const progress = document.getElementById('progress');
  const output = document.getElementById('output');
  // Clear previous output and show progress
  progress.textContent = 'Running scan...';
  output.textContent = '';
  try {
    const result = await ipcRenderer.invoke('select-folder', license);
    progress.textContent = 'Scan completed.';
    output.textContent = result;
  } catch (err) {
    progress.textContent = 'Error: ' + err;
    output.textContent = '';
  }});
