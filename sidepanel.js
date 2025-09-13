// Minimal sidepanel loader: load currentUrl (via proxy if present) into full-size iframe

async function loadUrl() {
  const { currentUrl, proxyBase } = await chrome.storage.local.get(['currentUrl','proxyBase']);
  const iframe = document.getElementById('frame');
  if (!currentUrl) return;
  const urlToLoad = currentUrl;

  // Use proxy if configured
  if (proxyBase && proxyBase !== '') {
    try {
      const encoded = encodeURIComponent(urlToLoad);
      iframe.src = `${proxyBase}?url=${encoded}`;
      return;
    } catch (e) {
      // fallback to direct
    }
  }

  // direct
  iframe.src = urlToLoad;
}

// Listen for storage changes so opening different site updates iframe immediately
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.currentUrl) {
    loadUrl();
  }
});

// Initialize
loadUrl();
