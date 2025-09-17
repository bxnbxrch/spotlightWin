const { ipcMain, shell } = require('electron');
const { spawn } = require('child_process');

function setupIPCHandlers(win, indexedItems) {
  // Get indexed items
  ipcMain.handle('get-indexed-items', () => indexedItems);

  // Launch item
  ipcMain.handle('launch-item', async (event, item) => {
    try {
      if (item.type === 'application') {
        if (item.path.endsWith('.lnk')) {
          shell.openPath(item.path);
        } else {
          spawn(item.path, [], { detached: true, stdio: 'ignore' });
        }
      } else if (item.type === 'file' || item.type === 'folder') {
        shell.openPath(item.path);
      } else if (item.type === 'web') {
        shell.openExternal(item.url);
      }
      return true;
    } catch (err) {
      console.error('Error launching item:', err);
      return false;
    }
  });

  // Window management
  ipcMain.handle('hide-window', () => win.hide());
  
  ipcMain.handle('resize-window', (event, height) => {
    const bounds = win.getBounds();
    win.setBounds({ ...bounds, height: Math.max(Math.min(height, 500), 140) });
  });
}

module.exports = {
  setupIPCHandlers
};