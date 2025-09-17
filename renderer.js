const { ipcRenderer } = require('electron');
const Fuse = require('fuse.js');
const math = require('mathjs');

class SpotlightRenderer {
  constructor() {
    this.allItems = [];
    this.filteredItems = [];
    this.selectedIndex = 0;
    this.isIndexing = true;
    
    this.searchInput = document.getElementById('search');
    this.resultsDiv = document.getElementById('results');
    
    this.setupEventListeners();
    this.loadIndexedItems();
  }

  setupEventListeners() {
    // Search input events
    this.searchInput.addEventListener('input', () => this.handleSearchInput());
    this.searchInput.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Window focus events
    window.addEventListener('focus', () => {
      this.searchInput.focus();
    });

    // IPC events
    ipcRenderer.on('clear-search', () => {
      this.searchInput.value = '';
      this.resultsDiv.innerHTML = '';
      this.selectedIndex = 0;
      this.resizeWindow();
    });

    ipcRenderer.on('focus-search', () => {
      this.searchInput.focus();
      this.searchInput.select();
    });

    ipcRenderer.on('indexing-complete', (event, count) => {
      this.isIndexing = false;
      console.log(`Indexing complete: ${count} items`);
      if (this.searchInput.value.trim() === '') {
        this.resultsDiv.innerHTML = '';
        this.resizeWindow();
      } else {
        this.handleSearchInput();
      }
    });
  }

  async loadIndexedItems() {
    try {
      // Initial load (might be empty)
      this.allItems = await ipcRenderer.invoke('get-indexed-items');

      // Listen for indexing complete event
      ipcRenderer.on('indexing-complete', async () => {
        this.allItems = await ipcRenderer.invoke('get-indexed-items');
        this.isIndexing = false;
        if (this.searchInput.value.trim() !== '') {
          this.handleSearchInput();
        }
      });
    } catch (error) {
      console.error('Error loading indexed items:', error);
      this.isIndexing = false;
    }
  }

  handleSearchInput() {
    const query = this.searchInput.value.trim();
    
    if (query === '') {
      this.resultsDiv.innerHTML = '';
      this.filteredItems = [];
      this.selectedIndex = 0;
      this.resizeWindow();
      return;
    }

    if (this.isIndexing) {
      this.resultsDiv.innerHTML = '<div class="loading">Still indexing... Please wait</div>';
      this.resizeWindow();
      return;
    }

    this.performSearch(query);
  }

  performSearch(query) {
    if (!this.allItems || this.allItems.length === 0) return;

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
    const fuse = new Fuse(this.allItems, {
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

      this.filteredItems = results
        .sort((a, b) => {
          // Web Search always at the bottom
          if (a.category === 'Web Search' && b.category !== 'Web Search') return 1;
          if (b.category === 'Web Search' && a.category !== 'Web Search') return -1;
          // Group by category order
          const categoryOrder = {
            'Applications': 1,
            'Folders': 2,
            'Files': 3,
            'Web Search': 99 // Always last
          };
          const aCat = categoryOrder[a.category] || 98;
          const bCat = categoryOrder[b.category] || 98;
          if (aCat !== bCat) return aCat - bCat;
          // Start Menu 'Programs' apps to top within Applications
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

    this.selectedIndex = 0;
    this.renderResults();
  }

  renderResults() {
    if (this.filteredItems.length === 0) {
      this.resultsDiv.innerHTML = '<div class="no-results">No results found</div>';
      this.resizeWindow();
      return;
    }

    let html = '';
    let currentCategory = '';
    let categoryItems = [];

    const flushCategory = () => {
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
          const isSelected = index === this.selectedIndex;
          const isWebSearch = item.type === 'web' && item.category === 'Web Search';
          let iconHtml = '';
          
          if (item.icon && typeof item.icon === 'string' && item.icon.startsWith('data:image')) {
            iconHtml = `<img class="item-icon" src="${item.icon}" width="24" height="24" style="border-radius:4px;vertical-align:middle;" />`;
          } else if (item.icon && typeof item.icon === 'string' && item.icon.length <= 3) {
            iconHtml = `<span class="item-icon">${this.escapeHtml(item.icon)}</span>`;
          } else {
            iconHtml = `<span class="item-icon">📄</span>`;
          }
          
          html += `
            <div class="result-item ${isSelected ? 'selected' : ''} ${isWebSearch ? 'web-search-item' : ''}" 
                 data-index="${index}">
                ${iconHtml}
                <div class="item-content">
                    <div class="item-name">${this.escapeHtml(item.name)}</div>
                    <div class="item-path">${this.escapeHtml(this.getDisplayPath(item))}</div>
                </div>
                ${item.category ? `<div class="item-category">${item.category}</div>` : ''}
            </div>
          `;
        });
        categoryItems = [];
      }
    };

    this.filteredItems.forEach((item, index) => {
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

    this.resultsDiv.innerHTML = html;

    // Add click event listeners
    const resultItems = this.resultsDiv.querySelectorAll('.result-item');
    resultItems.forEach((item, index) => {
      item.addEventListener('click', () => {
        this.selectedIndex = index;
        this.executeSelectedItem();
      });
      
      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });
    });
    
    this.updateSelection();
    this.resizeWindow();
  }

  getDisplayPath(item) {
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

  handleKeyDown(event) {
    if (this.filteredItems.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this.filteredItems.length;
        this.updateSelection();
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex = this.selectedIndex === 0 ? this.filteredItems.length - 1 : this.selectedIndex - 1;
        this.updateSelection();
        break;

      case 'Enter':
        event.preventDefault();
        this.executeSelectedItem();
        break;

      case 'Escape':
        event.preventDefault();
        ipcRenderer.invoke('hide-window');
        break;

      case 'Tab':
        event.preventDefault();
        if (this.filteredItems.length > 0) {
          const selectedItem = this.filteredItems[this.selectedIndex];
          if (selectedItem && selectedItem.type !== 'web') {
            this.searchInput.value = selectedItem.name;
            this.handleSearchInput();
          }
        }
        break;
    }
  }

  updateSelection() {
    const items = this.resultsDiv.querySelectorAll('.result-item');
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedIndex);
    });

    // Scroll selected item into view
    const selectedElement = items[this.selectedIndex];
    if (selectedElement) {
      selectedElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }

  async executeSelectedItem() {
    if (this.filteredItems.length === 0) return;

    const selectedItem = this.filteredItems[this.selectedIndex];
    
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

  resizeWindow() {
    const searchContainer = document.getElementById('search-container');
    const searchHeight = searchContainer.offsetHeight;
    const resultsHeight = this.resultsDiv.scrollHeight;
    const totalHeight = searchHeight + Math.min(resultsHeight, 380);
    
    ipcRenderer.invoke('resize-window', totalHeight + 2); // +2 for border
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
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
  
  // Create the spotlight instance
  new SpotlightRenderer();
});