const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 600,
    height: 80,
    frame: false, // borderless
    alwaysOnTop: true,
    show: false,  // start hidden
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  win.loadFile('index.html');
  win.setMenu(null);
}

app.whenReady().then(() => {
  createWindow();

  // Register global hotkey (Ctrl+Space)
  globalShortcut.register('Control+Space', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Close when window closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
