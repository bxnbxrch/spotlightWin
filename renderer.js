const Fuse = require('fuse.js');

// Dummy dataset (apps/files)
const items = [
  { name: 'Google Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
  { name: 'Notepad', path: 'C:\\Windows\\System32\\notepad.exe' }
];

const fuse = new Fuse(items, { keys: ['name'], threshold: 0.3 });
const input = document.getElementById('search');
const resultsDiv = document.getElementById('results');

input.addEventListener('input', () => {
  const query = input.value;
  resultsDiv.innerHTML = '';
  if (query.length > 0) {
    const results = fuse.search(query);
    results.forEach(r => {
      const div = document.createElement('div');
      div.className = 'item';
      div.textContent = r.item.name;
      div.onclick = () => {
        const { exec } = require('child_process');
        exec(`"${r.item.path}"`);
        window.close();
      };
      resultsDiv.appendChild(div);
    });
  }
});
