exports.handler = async function(event, context) {
  const target = (event.queryStringParameters && event.queryStringParameters.url) || '';
  if (!target) {
    return { statusCode: 400, body: 'Missing url parameter' };
  }

  if (typeof fetch === 'undefined') {
    return { statusCode: 500, body: 'Server runtime does not provide fetch. Deploy to Node 18+ or add node-fetch.' };
  }

  try {
    const res = await fetch(target, { redirect: 'follow' });
    const contentType = res.headers && (res.headers.get ? res.headers.get('content-type') : res.headers['content-type']) || '';

    if (!contentType.includes('text/html')) {
      // If CSS, rewrite url(...) to proxy so fonts and other referenced resources are fetched through proxy
      if (contentType.includes('text/css')) {
        let cssText = await res.text();
        const proxyBase = event.headers && event.headers['x-proxy-base'] ? event.headers['x-proxy-base'] : process.env.PROXY_BASE || '';
        const makeProxy = (u) => proxyBase ? `${proxyBase}?url=${encodeURIComponent(u)}` : u;
        cssText = cssText.replace(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi, (m, q, url) => `url(${q}${makeProxy(url)}${q})`);
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/css; charset=utf-8',
            'X-Frame-Options': 'ALLOWALL',
            'Access-Control-Allow-Origin': '*'
          },
          body: cssText
        };
      }

      // For other non-HTML, proxy as binary
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'X-Frame-Options': 'ALLOWALL',
          'Access-Control-Allow-Origin': '*'
        },
        body: buffer.toString('base64'),
        isBase64Encoded: true
      };
    }

    let text = await res.text();

    // Insert base tag so relative URLs resolve
    const baseTag = `<base href="${target}">`;
    text = text.replace(/<head(.*?)>/i, match => match + baseTag);

    // Inject viewport and mobile script to emulate iPhone
    const inject = `\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">\n<script>try{Object.defineProperty(navigator,'userAgent',{get:()=>"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",configurable:true});Object.defineProperty(navigator,'platform',{get:()=> 'iPhone',configurable:true});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5,configurable:true});}catch(e){};</script>\n`;
    text = text.replace(/<head(.*?)>/i, match => match + inject);

    // Rewrite absolute resource references (src, data-src, srcset, link[href], CSS url()) to go through our proxy
    // Determine proxy base: prefer env PROXY_BASE, otherwise derive from current request host
    const detectedProto = (event.headers && (event.headers['x-forwarded-proto'] || event.headers['x-forwarded-protocol'])) || 'https';
    const detectedHost = (event.headers && (event.headers['host'] || event.headers['x-forwarded-host'])) || '';
    const inferredBase = detectedHost ? `${detectedProto}://${detectedHost}/.netlify/functions/proxy` : '';
    const proxyBase = process.env.PROXY_BASE || inferredBase;
    const makeProxy = (u) => proxyBase ? `${proxyBase}?url=${encodeURIComponent(u)}` : u;

    // src and data-src
    text = text.replace(/(\s(?:src|data-src)\s*=\s*)(["'])(https?:\/\/[^"'>\s]+)\2/gi, (m, p1, p2, url) => `${p1}${p2}${makeProxy(url)}${p2}`);

    // link tags with href (stylesheets, etc.) — avoid anchor links
    text = text.replace(/(<link\b[^>]*?\bhref\s*=\s*)(["'])(https?:\/\/[^"'>\s]+)\2/gi, (m, p1, p2, url) => `${p1}${p2}${makeProxy(url)}${p2}`);

    // srcset handling
    text = text.replace(/\bsrcset\s*=\s*(["'])(.*?)\1/gi, (m, quote, val) => {
      const parts = val.split(',').map(item => {
        const sub = item.trim().split(/\s+/);
        const url = sub[0];
        if (/^https?:\/\//i.test(url)) {
          sub[0] = makeProxy(url);
        }
        return sub.join(' ');
      });
      return `srcset=${quote}${parts.join(', ')}${quote}`;
    });

    // CSS url(...) in style attributes and inline <style>
    text = text.replace(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi, (m, q, url) => `url(${q}${makeProxy(url)}${q})`);

    // @import 'https://...'
    text = text.replace(/@import\s+(?:url\()?['"]?(https?:\/\/[^'"\)]+)['"]?\)?/gi, (m, url) => `@import url('${makeProxy(url)}')`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'ALLOWALL',
        'Access-Control-Allow-Origin': '*'
      },
      body: text
    };
  } catch (err) {
    return { statusCode: 500, body: 'Fetch error: ' + String(err) };
  }
};
