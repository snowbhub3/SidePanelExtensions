const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const BASE_RULE_ID = 1000; // rule ids start from this
// Set your deployed proxy URL here (after deploying the serverless proxy to Netlify or Vercel)
const DEFAULT_PROXY_BASE = 'https://68c59296d6fdf1204a0ab6a4--resonant-pie-54b9fa.netlify.app/.netlify/functions/proxy';

async function openPanelForActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) return false;
    try {
      if (chrome.sidePanel && chrome.sidePanel.setOptions) {
        await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidepanel.html', enabled: true });
      }
      if (chrome.sidePanel && chrome.sidePanel.open) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        return true;
      }
    } catch (e) {
      return false;
    }
  } catch (e) {
    return false;
  }
  return false;
}

// Build DNR rules from saved sites
async function rebuildDNRRules() {
  try {
    const { savedSites } = await chrome.storage.local.get('savedSites');
    const sites = Array.isArray(savedSites) ? savedSites : [];
    // Remove old rules in our id range
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const myRuleIds = existing.filter(r => r.id >= BASE_RULE_ID && r.id < BASE_RULE_ID + 100000).map(r => r.id);
    if (myRuleIds.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: myRuleIds });
    }

    const rules = [];
    let idx = 0;
    for (const s of sites) {
      try {
        const domain = (new URL(s.url)).hostname;
        const id = BASE_RULE_ID + (++idx);
        const rule = {
          id,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'User-Agent', operation: 'set', value: IPHONE_UA }
            ]
          },
          condition: {
            // urlFilter matching hostname ensures our rule targets that domain
            urlFilter: domain,
            resourceTypes: ['main_frame']
          }
        };
        rules.push(rule);
      } catch (e) {
        // ignore malformed urls
      }
    }

    if (rules.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
    }
  } catch (e) {
    console.error('Failed to rebuild DNR rules', e);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    // ensure panel not auto-open
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(()=>{});
    }
  } catch (e) {}

  // persist default proxy if the user hasn't set one
  try {
    const stored = await chrome.storage.local.get('proxyBase');
    if (!stored || !stored.proxyBase) {
      if (DEFAULT_PROXY_BASE && DEFAULT_PROXY_BASE !== 'REPLACE_WITH_YOUR_PROXY_URL') {
        await chrome.storage.local.set({ proxyBase: DEFAULT_PROXY_BASE });
      }
    }
  } catch (e) {}

  // initial rules
  rebuildDNRRules();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === 'openSidePanel') {
    (async () => {
      const opened = await openPanelForActiveTab();
      if (!opened) {
        const { currentUrl } = await chrome.storage.local.get('currentUrl');
        if (currentUrl) {
          chrome.tabs.create({ url: currentUrl });
        }
      }
    })();
  }
  if (msg?.action === 'rebuildDNR') {
    rebuildDNRRules();
  }
});

// Rebuild rules when savedSites change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.savedSites) {
    rebuildDNRRules();
  }
});

// Expose helper for debugging
self.rebuildDNRRules = rebuildDNRRules;
