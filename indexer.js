const extractIcon = require('extract-file-icon');
const path = require('path');
const fs = require('fs');
const os = require('os');

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

async function scanDirectory(dirPath, itemType = 'mixed', maxDepth = 2, extra = {}, indexedItems) {
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
          await scanDirectory(fullPath, itemType, maxDepth - 1, extra, indexedItems);
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

async function indexSignificantDocuments(indexedItems) {
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
    if (fs.existsSync(folder.path)) {
      await scanDirectory(folder.path, 'mixed', 2, { isImportant: true }, indexedItems);
    }
  }
}

function addWebSearchSuggestions(indexedItems) {
  const web = [
    { name: 'Google Search', url: 'https://www.google.com/search?q=', icon: '🔍' },
    { name: 'YouTube', url: 'https://www.youtube.com/results?search_query=', icon: '📺' },
    { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/', icon: '📖' }
  ];
  web.forEach(item => indexedItems.push({ ...item, type: 'web', category: 'Web Search' }));
}

function addSystemCommands(indexedItems) {
  const cmds = [
    { name: 'Control Panel', path: 'control', icon: '⚙️' },
    { name: 'Task Manager', path: 'taskmgr', icon: '📊' },
    { name: 'Command Prompt', path: 'cmd', icon: '💻' }
  ];
  cmds.forEach(c => indexedItems.push({ ...c, type: 'application', category: 'System' }));
}

async function indexApplicationsAndFiles(indexedItems) {
  console.log('Starting indexing process...');
  
  // Index start menu applications
  const startMenuPaths = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join('C:', 'ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ];
  
  for (const startMenuPath of startMenuPaths) {
    if (fs.existsSync(startMenuPath)) {
      await scanDirectory(startMenuPath, 'mixed', 3, { isStartMenu: true }, indexedItems);
    }
  }
  
  // Index significant documents
  await indexSignificantDocuments(indexedItems);
  
  // Add web search and system commands
  addWebSearchSuggestions(indexedItems);
  addSystemCommands(indexedItems);
  
  console.log(`Indexing complete: ${indexedItems.length} items`);
  return indexedItems.length;
}

function initializeIndexing(win, indexedItems) {
  win.webContents.once('dom-ready', () => {
    console.log('Window DOM ready, starting indexing...');
    indexApplicationsAndFiles(indexedItems)
      .then(count => {
        win.webContents.send('indexing-complete', count);
      })
      .catch(err => {
        console.error('Indexing failed:', err);
      });
  });
}

module.exports = {
  initializeIndexing,
  indexApplicationsAndFiles,
  scanDirectory,
  safeExtractIcon,
  addWebSearchSuggestions,
  addSystemCommands
};