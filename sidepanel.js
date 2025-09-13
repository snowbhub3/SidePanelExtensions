function setUrlPill(u) {
  const pill = document.getElementById('urlPill');
  pill.textContent = u || '';
  pill.title = u || '';
}

function toMobileVariant(url) {
  try {
    const u = new URL(url);
    // Heuristic: try m.<host>
    if (!u.hostname.startsWith('m.')) {
      const mobile = new URL(url);
      mobile.hostname = 'm.' + mobile.hostname;
      return mobile.toString();
    }
    return url;
  } catch (e) {
    return url;
  }
}

async function loadUrl(useMobile = false) {
  const { currentUrl, proxyBase } = await chrome.storage.local.get(['currentUrl','proxyBase']);
  const iframe = document.getElementById('frame');
  const unsupported = document.getElementById('unsupported');
  if (!currentUrl) {
    unsupported.style.display = 'block';
    setUrlPill('No site selected');
    return;
  }
  setUrlPill(currentUrl);
  const urlToLoad = useMobile ? toMobileVariant(currentUrl) : currentUrl;
  unsupported.style.display = 'none';
  let didLoad = false;

  // Prefer using proxy if configured
  if (proxyBase) {
    try {
      const encoded = encodeURIComponent(urlToLoad);
      iframe.src = `${proxyBase}?url=${encoded}`;
      const timer = setTimeout(() => { if (!didLoad) unsupported.style.display = 'block'; }, 5000);
      iframe.onload = () => { didLoad = true; clearTimeout(timer); unsupported.style.display = 'none'; };
      iframe.onerror = () => { unsupported.style.display = 'block'; };
      return;
    } catch (e) {
      // fallback to direct
    }
  }

  // Attempt fetch-and-embed as HTML (works when CORS allows). This can bypass some framing restrictions
  try {
    const res = await fetch(urlToLoad, { method: 'GET', mode: 'cors' });
    if (res.ok) {
      const text = await res.text();
      const base = `<base href="${urlToLoad}">`;
      iframe.srcdoc = base + text;
      const timer = setTimeout(() => { if (!didLoad) unsupported.style.display = 'block'; }, 5000);
      iframe.onload = () => { didLoad = true; clearTimeout(timer); unsupported.style.display = 'none'; };
      iframe.onerror = () => { unsupported.style.display = 'block'; };
      return;
    }
  } catch (e) {
    // fetch failed due to CORS or network; fall back to iframe src
  }

  // Fallback: use direct iframe src (may be blocked by X-Frame-Options or CSP)
  try {
    iframe.src = urlToLoad;
    const timer = setTimeout(() => { if (!didLoad) unsupported.style.display = 'block'; }, 5000);
    iframe.onload = () => { didLoad = true; clearTimeout(timer); unsupported.style.display = 'none'; };
    iframe.onerror = () => { unsupported.style.display = 'block'; };
  } catch (e) {
    unsupported.style.display = 'block';
  }
}

function applyScale() {
  const s = parseFloat(document.getElementById('scale').value || '1');
  const frame = document.querySelector('.iframe-inner');
  frame.style.transform = `scale(${s})`;
  frame.style.transformOrigin = 'top center';
}

document.getElementById('reload').addEventListener('click', () => loadUrl());

document.getElementById('openOriginal').addEventListener('click', async () => {
  const { currentUrl } = await chrome.storage.local.get('currentUrl');
  if (currentUrl) chrome.tabs.create({ url: currentUrl });
});

document.getElementById('scale').addEventListener('change', applyScale);

document.getElementById('tryMobile').addEventListener('click', () => loadUrl(true));

applyScale();
loadUrl();
