// content_script.js
// Responsibilities:
// - respond to popup requests for metadata (title + favicon)
// - if current site is in savedSites, inject a page script at document_start to override navigator properties (userAgent, platform, maxTouchPoints, userAgentData)

// Listen for popup messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === 'getMetadata') {
    try {
      const title = document.title || null;
      const iconEl = document.querySelector('link[rel~="icon"]') || document.querySelector('link[rel~="shortcut icon"]') || document.querySelector('link[rel~="apple-touch-icon"]');
      let favicon = iconEl ? iconEl.getAttribute('href') : null;
      if (favicon) {
        try { favicon = new URL(favicon, location.href).toString(); } catch (e) { /* ignore */ }
      }
      sendResponse({ title, favicon });
    } catch (e) {
      sendResponse({ title: null, favicon: null });
    }
    return true;
  }
});

// Helper: inject script into page context
function injectScript(code) {
  const script = document.createElement('script');
  script.textContent = code;
  (document.documentElement || document.head || document.body || document).appendChild(script);
  script.parentNode.removeChild(script);
}

// Build injection code that overrides navigator properties
function buildOverrideCode() {
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  return `(function(){
    try {
      // userAgent
      Object.defineProperty(navigator, 'userAgent', {
        get: function(){ return '${ua}'; },
        configurable: true
      });
      // platform
      try { Object.defineProperty(navigator, 'platform', { get: function(){ return 'iPhone'; }, configurable: true }); } catch(e){}
      // maxTouchPoints
      try { Object.defineProperty(navigator, 'maxTouchPoints', { get: function(){ return 5; }, configurable: true }); } catch(e){}
      // userAgentData (partial)
      try {
        const uad = { brands: [{brand: 'Safari', version: '17'}, {brand: 'Chromium', version: '0'}], mobile: true };
        Object.defineProperty(navigator, 'userAgentData', { get: function(){ return uad; }, configurable: true });
      } catch(e){}
      // Touch event support
      try { window.ontouchstart = window.ontouchstart || null; } catch(e){}
    } catch (e) { /* ignore */ }
  })();`;
}

// Check storage to see if we should override on this host
(async function maybeOverride(){
  try {
    const data = await chrome.storage.local.get('savedSites');
    const sites = Array.isArray(data.savedSites) ? data.savedSites : [];
    if (!sites.length) return;
    const host = location.hostname;
    // If any saved site matches host (exact or endsWith), inject override
    const match = sites.find(s => {
      try { const u = new URL(s.url); const h = u.hostname; return host === h || host.endsWith('.' + h); } catch (e) { return false; }
    });
    if (match) {
      // inject code as early as possible
      const code = buildOverrideCode();
      injectScript(code);
    }
  } catch (e) {
    // ignore
  }
})();
