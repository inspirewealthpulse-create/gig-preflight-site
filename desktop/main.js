const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { execFile } = require('child_process');
const path = require('path');

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle folder selection and run CLI
ipcMain.handle('select-folder', async (_, licenseKey) => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) {
    return 'No folder selected.';
  }
  const folder = result.filePaths[0];
  return new Promise((resolve, reject) => {
    // Build the path to the CLI index.js (one level up)
    const cliPath = path.join(__dirname, '..', 'cli', 'index.js');
    execFile('node', [cliPath, '--path', folder, '--license', licenseKey], (error, stdout, stderr) => {
      if (error) {
        reject(stderr || error.message);
      } else {
        resolve(stdout);
      }
    });
  });
});
