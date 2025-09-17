const { BrowserWindow, globalShortcut, screen } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 700,
    height: 140,
    frame: false,
    alwaysOnTop: true,
    show: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  win.loadFile('index.html');
  win.setMenu(null);

  // Center window on screen
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  win.setPosition(Math.round((width - 700) / 2), Math.round(height * 0.2));

  win.on('blur', () => {
    if (win.isVisible()) {
      win.hide();
      win.webContents.send('clear-search');
    }
  });

  return win;
}

function toggleWindow(win) {
  if (win.isVisible()) {
    win.hide();
    win.webContents.send('clear-search');
  } else {
    // Center window every time before showing
    const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;
    win.setPosition(Math.round((width - win.getBounds().width) / 2), Math.round(height * 0.2));
    win.show();
    win.focus();
    win.webContents.send('focus-search');
  }
}

function registerGlobalShortcuts(win) {
  globalShortcut.register('Control+Space', () => toggleWindow(win));
  globalShortcut.register('Alt+Space', () => toggleWindow(win));
  globalShortcut.register('Escape', () => {
    if (win.isVisible()) {
      win.hide();
      win.webContents.send('clear-search');
    }
  });
}

function unregisterAllShortcuts() {
  globalShortcut.unregisterAll();
}

module.exports = {
  createWindow,
  toggleWindow,
  registerGlobalShortcuts,
  unregisterAllShortcuts
};