const { ipcRenderer } = require('electron');

document.getElementById('scan').addEventListener('click', async () => {
  const license = document.getElementById('license').value.trim();
  const output = document.getElementById('output');
  output.textContent = 'Running scan...';
  try {
    const result = await ipcRenderer.invoke('select-folder', license);
    output.textContent = result;
  } catch (err) {
    output.textContent = 'Error: ' + err;
  }
});
