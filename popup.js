const SITES_KEY = 'savedSites';

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getSites() {
  const { [SITES_KEY]: data } = await chrome.storage.local.get(SITES_KEY);
  return Array.isArray(data) ? data : [];
}

async function setSites(sites) {
  await chrome.storage.local.set({ [SITES_KEY]: sites });
}

function faviconFor(url) {
  return `chrome://favicon/size/32/${url}`;
}

function normalizeUrl(u) {
  try { return new URL(u).toString(); } catch { return u; }
}

function createSiteRow(site, i) {
  const row = document.createElement('div');
  row.className = 'site';

  const left = document.createElement('div');
  left.className = 'info';
  const img = document.createElement('img');
  img.className = 'favicon';
  img.src = site.favicon || faviconFor(site.url);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = site.title || site.url;
  const urlSpan = document.createElement('div');
  urlSpan.className = 'url';
  urlSpan.textContent = site.url;

  meta.appendChild(name);
  meta.appendChild(urlSpan);
  left.appendChild(img);
  left.appendChild(meta);

  const openBtn = document.createElement('button');
  openBtn.className = 'icon-btn';
  openBtn.title = 'Відкрити у бічній панелі';
  openBtn.innerHTML = 'Open';
  openBtn.addEventListener('click', async () => {
    // Save current URL for the sidepanel to load
    await chrome.storage.local.set({ currentUrl: site.url });

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && chrome.sidePanel && chrome.sidePanel.setOptions) {
        // Bind side panel to the active tab to ensure content loads in-panel
        await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidepanel.html', enabled: true });
      }
      if (chrome.sidePanel && chrome.sidePanel.open) {
        await chrome.sidePanel.open({ windowId: tab?.windowId });
      } else {
        console.error('SidePanel API not available');
      }
    } catch (e) {
      console.error('Failed to open side panel', e);
    }

    window.close();
  });

  const newTabBtn = document.createElement('button');
  newTabBtn.className = 'icon-btn';
  newTabBtn.title = 'Відкрити у новій вкладці';
  newTabBtn.innerHTML = 'Tab';
  newTabBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: site.url });
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn';
  delBtn.title = 'Видалити';
  delBtn.innerHTML = 'Del';
  delBtn.addEventListener('click', async () => {
    const sites = await getSites();
    sites.splice(i, 1);
    await setSites(sites);
    renderSites(sites);
  });

  const right = document.createElement('div');
  right.className = 'site-actions';
  right.appendChild(openBtn);
  right.appendChild(newTabBtn);
  right.appendChild(delBtn);

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

async function renderSites(list) {
  const container = document.getElementById('sites');
  container.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = '<div class="helper">Список порожній. Нати��ніть «Додати поточну», щоб зберегти сайт.</div>';
    container.appendChild(empty);
    return;
  }
  list.forEach((s, i) => container.appendChild(createSiteRow(s, i)));
}

async function addCurrent() {
  const tab = await getActiveTab();
  if (!tab || !tab.url) return;
  const url = normalizeUrl(tab.url);
  const sites = await getSites();
  if (sites.find((s) => s.url === url)) return;

  let title = tab.title || url;
  let favicon = faviconFor(url);

  // Try to get metadata from content script in the active tab (no CORS)
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'getMetadata' });
    if (res?.title) title = res.title;
    if (res?.favicon) favicon = res.favicon;
  } catch (e) {
    // content script may not be available on some pages; keep fallback
  }

  sites.unshift({ url, title, favicon });
  await setSites(sites);
  renderSites(sites);
}

async function clearAll() {
  await setSites([]);
  renderSites([]);
}

async function init() {
  document.getElementById('addCurrent').addEventListener('click', addCurrent);
  document.getElementById('clearAll').addEventListener('click', clearAll);
  document.getElementById('openSidePanel').addEventListener('click', () => chrome.runtime.sendMessage({ action: 'openSidePanel' }));
  const sites = await getSites();
  renderSites(sites);
}

init();
