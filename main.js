const { app } = require('electron');
const WindowManager = require('./windowManager');
const Indexer = require('./indexer');
const IPCHandlers = require('./ipcHandlers');

// Global references
let win;
let indexedItems = [];

app.whenReady().then(() => {
  // Create main window
  win = WindowManager.createWindow();
  
  // Initialize indexing
  Indexer.initializeIndexing(win, indexedItems);
  
  // Setup IPC handlers
  IPCHandlers.setupIPCHandlers(win, indexedItems);
  
  // Register global shortcuts
  WindowManager.registerGlobalShortcuts(win);
});

app.on('will-quit', () => {
  WindowManager.unregisterAllShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});