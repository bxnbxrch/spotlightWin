const { ipcRenderer } = require('electron');

let allItems = [];
let filteredItems = [];
let selectedIndex = 0;
let isIndexing = true;

const searchInput = document.getElementById('search');
const resultsDiv = document.getElementById('results');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadIndexedItems();
});

function setupEventListeners() {
    // Search input events
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keydown', handleKeyDown);

    // Window focus events
    window.addEventListener('focus', () => {
        searchInput.focus();
    });

    // IPC events
    ipcRenderer.on('clear-search', () => {
        searchInput.value = '';
        resultsDiv.innerHTML = '';
        selectedIndex = 0;
        resizeWindow();
    });

    ipcRenderer.on('focus-search', () => {
        searchInput.focus();
        searchInput.select();
    });

    ipcRenderer.on('indexing-complete', (event, count) => {
        isIndexing = false;
        console.log(`Indexing complete: ${count} items`);
        if (searchInput.value.trim() === '') {
            resultsDiv.innerHTML = '';
            resizeWindow();
        } else {
            handleSearchInput();
        }
    });
}

async function loadIndexedItems() {
    try {
        // Initial load (might be empty)
        allItems = await ipcRenderer.invoke('get-indexed-items');

        // Listen for indexing complete event
        ipcRenderer.on('indexing-complete', async () => {
            allItems = await ipcRenderer.invoke('get-indexed-items');
            isIndexing = false;
            if (searchInput.value.trim() !== '') {
                handleSearchInput();
            }
        });

    } catch (error) {
        console.error('Error loading indexed items:', error);
        isIndexing = false;
    }
}


function handleSearchInput() {
    const query = searchInput.value.trim();
    
    if (query === '') {
        resultsDiv.innerHTML = '';
        filteredItems = [];
        selectedIndex = 0;
        resizeWindow();
        return;
    }

    if (isIndexing) {
        resultsDiv.innerHTML = '<div class="loading">Still indexing... Please wait</div>';
        resizeWindow();
        return;
    }

    performSearch(query);
}
const Fuse = require('fuse.js');
// Math.js for math evaluation
const math = require('mathjs');

function performSearch(query) {
    if (!allItems || allItems.length === 0) return;

    // Math detection: simple regex for math expressions
    const mathRegex = /^([\d\s\+\-\*\/\^\(\)\.]+|what is|calculate|solve)\s*([\d\s\+\-\*\/\^\(\)\.]+)?$/i;
    let results = [];

    if (mathRegex.test(query)) {
        try {
            const mathResult = math.evaluate(query.replace(/(what is|calculate|solve)/i, '').trim());
            results.push({
                name: `Result: ${mathResult}`,
                type: 'math',
                category: 'Math',
                score: 100
            });
        } catch (e) {
            results.push({
                name: `Could not evaluate math expression`,
                type: 'math',
                category: 'Math',
                score: 1
            });
        }
    }

    // Improved fuzzy search
    const fuse = new Fuse(allItems, {
        keys: ['name', 'path', 'category'],
        threshold: 0.3,
        includeScore: true,
    });

    results = results.concat(fuse.search(query).map(res => ({
        ...res.item,
        score: (1 - res.score) * 100
    })));

    // Add web search suggestions
    if (query.length >= 2) {
        results.push({
            name: `Search Google for "${query}"`,
            type: 'web',
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            category: 'Web Search',
            score: 5
        });

        results.push({
            name: `Search YouTube for "${query}"`,
            type: 'web',
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
            category: 'Web Search',
            score: 4
        });
    }

    filteredItems = results
        .sort((a, b) => {
            // Start Menu 'Programs' apps to top
            if (a.category === 'Applications' && b.category === 'Applications') {
                if (a.isStartMenu && !b.isStartMenu) return -1;
                if (!a.isStartMenu && b.isStartMenu) return 1;
            }
            // Move items without a valid icon to the bottom
            const aHasIcon = a.icon && (a.icon.startsWith('data:image') || (typeof a.icon === 'string' && a.icon.length <= 3));
            const bHasIcon = b.icon && (b.icon.startsWith('data:image') || (typeof b.icon === 'string' && b.icon.length <= 3));
            if (aHasIcon && !bHasIcon) return -1;
            if (!aHasIcon && bHasIcon) return 1;
            return b.score - a.score;
        })
        .slice(0, 15);

    selectedIndex = 0;
    renderResults();
}


function renderResults() {
    if (filteredItems.length === 0) {
        resultsDiv.innerHTML = '<div class="no-results">No results found</div>';
        resizeWindow();
        return;
    }

    let html = '';
    let currentCategory = '';
    let categoryItems = [];

    function flushCategory() {
        if (categoryItems.length > 0) {
            // Sort items with icons first
            categoryItems.sort((a, b) => {
                const aHasIcon = a.icon && (a.icon.startsWith('data:image') || (typeof a.icon === 'string' && a.icon.length <= 3));
                const bHasIcon = b.icon && (b.icon.startsWith('data:image') || (typeof b.icon === 'string' && b.icon.length <= 3));
                if (aHasIcon && !bHasIcon) return -1;
                if (!aHasIcon && bHasIcon) return 1;
                return 0;
            });
            categoryItems.forEach(({item, index}) => {
                const isSelected = index === selectedIndex;
                const isWebSearch = item.type === 'web' && item.category === 'Web Search';
                let iconHtml = '';
                if (item.icon && typeof item.icon === 'string' && item.icon.startsWith('data:image')) {
                    iconHtml = `<img class="item-icon" src="${item.icon}" width="24" height="24" style="border-radius:4px;vertical-align:middle;" />`;
                } else if (item.icon && typeof item.icon === 'string' && item.icon.length <= 3) {
                    iconHtml = `<span class="item-icon">${escapeHtml(item.icon)}</span>`;
                } else {
                    iconHtml = `<span class="item-icon">📄</span>`;
                }
                html += `
                    <div class="result-item ${isSelected ? 'selected' : ''} ${isWebSearch ? 'web-search-item' : ''}" 
                         data-index="${index}">
                        ${iconHtml}
                        <div class="item-content">
                            <div class="item-name">${escapeHtml(item.name)}</div>
                            <div class="item-path">${escapeHtml(getDisplayPath(item))}</div>
                        </div>
                        ${item.category ? `<div class="item-category">${item.category}</div>` : ''}
                    </div>
                `;
            });
            categoryItems = [];
        }
    }

    filteredItems.forEach((item, index) => {
        if (item.category && item.category !== currentCategory) {
            flushCategory();
            if (currentCategory !== '') {
                html += `<div class="category-separator">${item.category}</div>`;
            }
            currentCategory = item.category;
        }
        categoryItems.push({item, index});
    });
    flushCategory();

    resultsDiv.innerHTML = html;

    // Add click event listeners
    const resultItems = resultsDiv.querySelectorAll('.result-item');
    resultItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            selectedIndex = index;
            executeSelectedItem();
        });
        
        item.addEventListener('mouseenter', () => {
            selectedIndex = index;
            updateSelection();
        });
    });
    updateSelection();
    resizeWindow();
}

function getDisplayPath(item) {
    if (item.type === 'web') {
        return item.url || 'Web Search';
    }
    
    if (!item.path) {
        return item.category || '';
    }

    // Shorten long paths
    const path = item.path.replace(/\\/g, '/');
    if (path.length > 60) {
        const parts = path.split('/');
        if (parts.length > 3) {
            return `.../${parts.slice(-2).join('/')}`;
        }
    }
    
    return path;
}

function handleKeyDown(event) {
    if (filteredItems.length === 0) return;

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            selectedIndex = (selectedIndex + 1) % filteredItems.length;
            updateSelection();
            break;

        case 'ArrowUp':
            event.preventDefault();
            selectedIndex = selectedIndex === 0 ? filteredItems.length - 1 : selectedIndex - 1;
            updateSelection();
            break;

        case 'Enter':
            event.preventDefault();
            executeSelectedItem();
            break;

        case 'Escape':
            event.preventDefault();
            ipcRenderer.invoke('hide-window');
            break;

        case 'Tab':
            event.preventDefault();
            if (filteredItems.length > 0) {
                const selectedItem = filteredItems[selectedIndex];
                if (selectedItem && selectedItem.type !== 'web') {
                    searchInput.value = selectedItem.name;
                    handleSearchInput();
                }
            }
            break;
    }
}

function updateSelection() {
    const items = resultsDiv.querySelectorAll('.result-item');
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedIndex);
    });

    // Scroll selected item into view
    const selectedElement = items[selectedIndex];
    if (selectedElement) {
        selectedElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
        });
    }
}


async function executeSelectedItem() {
    if (filteredItems.length === 0) return;

    const selectedItem = filteredItems[selectedIndex];
    
    try {
        const success = await ipcRenderer.invoke('launch-item', selectedItem);
        if (success) {
            await ipcRenderer.invoke('hide-window');
        } else {
            console.error('Failed to launch item:', selectedItem);
        }
    } catch (error) {
        console.error('Error executing item:', error);
    }
}

function resizeWindow() {
    const searchContainer = document.getElementById('search-container');
    const searchHeight = searchContainer.offsetHeight;
    const resultsHeight = resultsDiv.scrollHeight;
    const totalHeight = searchHeight + Math.min(resultsHeight, 380);
    
    ipcRenderer.invoke('resize-window', totalHeight + 2); // +2 for border
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle global escape key for the entire document
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        event.preventDefault();
        ipcRenderer.invoke('hide-window');
    }
    
    if (event.ctrlKey && event.key === 'r') {
        event.preventDefault();
        location.reload();
    }
});

// Debounce search input for better performance
let searchTimeout;
const originalHandleSearchInput = handleSearchInput;
handleSearchInput = function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(originalHandleSearchInput, 150);
};