const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require('electron');
const extractIcon = require('extract-file-icon');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');

let win;
let indexedItems = [];

function createWindow() {
    win = new BrowserWindow({
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
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    win.setPosition(Math.round((width - 700) / 2), Math.round(height * 0.2));

    win.on('blur', () => {
        if (win.isVisible()) {
            win.hide();
            win.webContents.send('clear-search');
        }
    });

    win.webContents.once('dom-ready', () => {
        console.log('Window DOM ready, starting indexing...');
        indexApplicationsAndFiles().catch(err => {
            console.error('Indexing failed:', err);
        });
    });
}

app.whenReady().then(() => {
    createWindow();

    globalShortcut.register('Control+Space', () => toggleWindow());
    globalShortcut.register('Alt+Space', () => toggleWindow());
    globalShortcut.register('Escape', () => {
        if (win.isVisible()) {
            win.hide();
            win.webContents.send('clear-search');
        }
    });
});

function toggleWindow() {
    if (win.isVisible()) {
        win.hide();
        win.webContents.send('clear-search');
    } else {
        win.show();
        win.focus();
        win.webContents.send('focus-search');
    }
}

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-indexed-items', () => indexedItems);
// ...existing code...

async function scanDirectory(dirPath, itemType, maxDepth = 2, extra = {}) {
    if (maxDepth <= 0) return;
    try {
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            try {
                const stats = fs.statSync(fullPath);
                if (stats.isDirectory()) {
                    if (itemType === 'mixed' || itemType === 'folder') {
                        indexedItems.push(Object.assign({
                            name: item,
                            path: fullPath,
                            type: 'folder',
                            icon: '📁',
                            category: 'Folders'
                        }, extra));
                    }
                    await scanDirectory(fullPath, itemType, maxDepth - 1, extra);
                } else {
                    const ext = path.extname(item).toLowerCase();
                    if (ext === '.lnk') {
                        const appName = path.basename(item, '.lnk');
                        if (!appName.toLowerCase().includes('uninstall') && !appName.toLowerCase().includes('remove') && appName.trim() !== '') {
                            let iconPath = null;
                            try {
                                const iconBuffer = extractIcon(fullPath, 32);
                                if (iconBuffer && Buffer.isBuffer(iconBuffer)) {
                                    const base64 = iconBuffer.toString('base64');
                                    iconPath = `data:image/png;base64,${base64}`;
                                } else if (typeof iconBuffer === 'string') {
                                    iconPath = iconBuffer;
                                }
                            } catch (e) {}
                            if (!iconPath || typeof iconPath !== 'string') iconPath = 'shortcut';
                            indexedItems.push(Object.assign({
                                name: appName,
                                path: fullPath,
                                type: 'application',
                                icon: iconPath,
                                category: 'Applications'
                            }, extra));
                        }
                    } else if (ext === '.exe' && (itemType === 'application' || itemType === 'mixed')) {
                        const appName = path.basename(item, '.exe');
                        if (!appName.toLowerCase().includes('uninstall') && !appName.toLowerCase().includes('setup') && !appName.toLowerCase().includes('install') && appName.trim() !== '') {
                            let iconPath = null;
                            try {
                                const iconBuffer = extractIcon(fullPath, 32);
                                if (iconBuffer && Buffer.isBuffer(iconBuffer)) {
                                    const base64 = iconBuffer.toString('base64');
                                    iconPath = `data:image/png;base64,${base64}`;
                                } else if (typeof iconBuffer === 'string') {
                                    iconPath = iconBuffer;
                                }
                            } catch (e) {}
                            if (!iconPath || typeof iconPath !== 'string') iconPath = 'exe';
                            indexedItems.push(Object.assign({
                                name: appName,
                                path: fullPath,
                                type: 'application',
                                icon: iconPath,
                                category: 'Applications'
                            }, extra));
                        }
                    } else if (itemType === 'mixed') {
                        let iconPath = null;
                        try {
                            const iconBuffer = extractIcon(fullPath, 32);
                            if (iconBuffer && Buffer.isBuffer(iconBuffer)) {
                                const base64 = iconBuffer.toString('base64');
                                iconPath = `data:image/png;base64,${base64}`;
                            } else if (typeof iconBuffer === 'string') {
                                iconPath = iconBuffer;
                            }
                        } catch (e) {}
                        if (!iconPath || typeof iconPath !== 'string') iconPath = getFileIcon(item);
                        indexedItems.push(Object.assign({
                            name: item,
                            path: fullPath,
                            type: 'file',
                            icon: iconPath,
                            category: 'Files'
                        }, extra));
                    }
                }
            } catch (statError) {
                continue;
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dirPath}:`, error.message);
    }
}

async function scanDirectoryForExecutables(dirPath, maxDepth = 1, extra = {}) {
    if (maxDepth <= 0) return;
    try {
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            try {
                const stats = fs.statSync(fullPath);
                if (stats.isDirectory() && maxDepth > 1) {
                    await scanDirectoryForExecutables(fullPath, maxDepth - 1, extra);
                } else if (path.extname(item).toLowerCase() === '.exe') {
                    const appName = path.basename(item, '.exe');
                    if (!appName.toLowerCase().includes('uninstall') && !appName.toLowerCase().includes('setup') && !appName.toLowerCase().includes('install') && appName.trim() !== '') {
                        let iconPath = null;
                        try {
                            const iconBuffer = extractIcon(fullPath, 32);
                            if (iconBuffer && Buffer.isBuffer(iconBuffer)) {
                                const base64 = iconBuffer.toString('base64');
                                iconPath = `data:image/png;base64,${base64}`;
                            } else if (typeof iconBuffer === 'string') {
                                iconPath = iconBuffer;
                            }
                        } catch (e) {}
                        if (!iconPath || typeof iconPath !== 'string') iconPath = '⚡';
                        indexedItems.push(Object.assign({
                            name: appName,
                            path: fullPath,
                            type: 'application',
                            icon: iconPath,
                            category: 'Applications'
                        }, extra));
                    }
                }
            } catch (statError) {
                continue;
            }
        }
    } catch (error) {
        console.error(`Error scanning for executables in ${dirPath}:`, error.message);
    }
}

function addWebSearchSuggestions() {
    const webSuggestions = [
        { name: 'Google Search', url: 'https://www.google.com/search?q=', icon: '🔍' },
        { name: 'YouTube', url: 'https://www.youtube.com/results?search_query=', icon: '📺' },
        { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/', icon: '📖' }
    ];
    webSuggestions.forEach(item => {
        indexedItems.push({ ...item, type: 'web', category: 'Web Search' });
    });
}

function getFileIcon(item) {
    if (!item) return '📄';
    if (item.type === 'folder') return '📁';
    if (item.type === 'application') return '⚡';
    const ext = path.extname(item.name || '').toLowerCase();
    const iconMap = {
        '.txt': '📄', '.doc': '📄', '.docx': '📄', '.pdf': '📄',
        '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️',
        '.mp3': '🎵', '.wav': '🎵', '.flac': '🎵',
        '.mp4': '🎬', '.avi': '🎬', '.mkv': '🎬',
        '.lnk': '🔗', '.exe': '⚡'
    };
    return iconMap[ext] || '📄';
}
const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require('electron');
const extractIcon = require('extract-file-icon');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');

// ...existing code...

// Helper to safely extract icons
function safeExtractIcon(fullPath, fallback = '📄') {
    try {
        const iconBuffer = extractIcon(fullPath, 32);
        if (iconBuffer && Buffer.isBuffer(iconBuffer)) {
            const base64 = iconBuffer.toString('base64');
            return `data:image/png;base64,${base64}`;
        } else if (typeof iconBuffer === 'string') {
            return iconBuffer;
        }
    } catch (e) {}
    return fallback;
}

// Scan directory helper
async function scanDirectory(dirPath, itemType = 'mixed', maxDepth = 2, extra = {}) {
    if (maxDepth <= 0) return;
    try {
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            try {
                const stats = fs.statSync(fullPath);
                if (stats.isDirectory()) {
                    if (itemType === 'mixed' || itemType === 'folder') {
                        indexedItems.push({
                            name: item,
                            path: fullPath,
                            type: 'folder',
                            icon: '📁',
                            category: 'Folders',
                            ...extra
                        });
                    }
                    await scanDirectory(fullPath, itemType, maxDepth - 1, extra);
                } else {
                    const ext = path.extname(item).toLowerCase();
                    if (ext === '.lnk') {
                        const appName = path.basename(item, '.lnk');
                        if (!appName.toLowerCase().includes('uninstall') &&
                            !appName.toLowerCase().includes('remove') &&
                            appName.trim() !== '') {
                            indexedItems.push({
                                name: appName,
                                path: fullPath,
                                type: 'application',
                                icon: safeExtractIcon(fullPath, 'shortcut'),
                                category: 'Applications',
                                ...extra
                            });
                        }
                    } else if (ext === '.exe' && (itemType === 'application' || itemType === 'mixed')) {
                        const appName = path.basename(item, '.exe');
                        if (!appName.toLowerCase().includes('uninstall') &&
                            !appName.toLowerCase().includes('setup') &&
                            !appName.toLowerCase().includes('install') &&
                            appName.trim() !== '') {
                            indexedItems.push({
                                name: appName,
                                path: fullPath,
                                type: 'application',
                                icon: safeExtractIcon(fullPath, 'exe'),
                                category: 'Applications',
                                ...extra
                            });
                        }
                    } else if (itemType === 'mixed') {
                        indexedItems.push({
                            name: item,
                            path: fullPath,
                            type: 'file',
                            icon: safeExtractIcon(fullPath),
                            category: 'Files',
                            ...extra
                        });
                    }
                }
            } catch {
                continue;
            }
        }
    } catch (error) {
        console.error(`Error scanning ${dirPath}:`, error.message);
    }
}

// Scan for executables only
async function scanDirectoryForExecutables(dirPath, maxDepth = 1, extra = {}) {
    await scanDirectory(dirPath, 'application', maxDepth, extra);
}

// IPC handlers
ipcMain.handle('get-indexed-items', () => indexedItems);

ipcMain.handle('launch-item', async (event, item) => {
    try {
        if (item.type === 'application') {
            if (item.path.endsWith('.lnk')) shell.openPath(item.path);
            else spawn(item.path, [], { detached: true, stdio: 'ignore' });
        } else if (item.type === 'file' || item.type === 'folder') shell.openPath(item.path);
        else if (item.type === 'web') shell.openExternal(item.url);
        return true;
    } catch (err) {
        console.error('Error launching item:', err);
        return false;
    }
});

ipcMain.handle('hide-window', () => win.hide());
ipcMain.handle('resize-window', (event, height) => {
    const bounds = win.getBounds();
    win.setBounds({ ...bounds, height: Math.max(Math.min(height, 500), 140) });
});

// Indexing important folders
async function indexSignificantDocuments() {
    const recentPath = path.join(os.homedir(), 'AppData/Roaming/Microsoft/Windows/Recent');
    if (fs.existsSync(recentPath)) {
        try {
            fs.readdirSync(recentPath).slice(0, 20).forEach(file => {
                if (file.endsWith('.lnk')) {
                    indexedItems.push({
                        name: path.basename(file, '.lnk'),
                        path: path.join(recentPath, file),
                        type: 'file',
                        icon: '📄',
                        category: 'Recent Files',
                        isRecent: true,
                        isImportant: true
                    });
                }
            });
        } catch {}
    }

    const folders = ['Desktop', 'Documents', 'Downloads'].map(f => ({
        name: f,
        path: path.join(os.homedir(), f)
    }));

    for (const folder of folders) {
        if (fs.existsSync(folder.path)) await scanDirectory(folder.path, 'mixed', 2, { isImportant: true });
    }
}

// Web and system commands
function addWebSearchSuggestions() {
    const web = [
        { name: 'Google Search', url: 'https://www.google.com/search?q=', icon: '🔍' },
        { name: 'YouTube', url: 'https://www.youtube.com/results?search_query=', icon: '📺' },
        { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/', icon: '📖' }
    ];
    web.forEach(item => indexedItems.push({ ...item, type: 'web', category: 'Web Search' }));
}

function addSystemCommands() {
    const cmds = [
        { name: 'Control Panel', path: 'control', icon: '⚙️' },
        { name: 'Task Manager', path: 'taskmgr', icon: '📊' },
        { name: 'Command Prompt', path: 'cmd', icon: '💻' }
    ];
    cmds.forEach(c => indexedItems.push({ ...c, type: 'application', category: 'System' }));
}

function getFileIcon(item) {
    if (!item) return '📄';
    const ext = path.extname(item.name || '').toLowerCase();
    const map = { '.txt':'📄', '.pdf':'📄', '.jpg':'🖼️', '.png':'🖼️', '.mp3':'🎵', '.mp4':'🎬', '.lnk':'🔗', '.exe':'⚡' };
    return map[ext] || '📄';
}
