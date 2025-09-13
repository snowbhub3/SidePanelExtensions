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
    const injectBase = `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">`;

    // Determine proxy base: prefer env PROXY_BASE, otherwise derive from current request host
    const detectedProto = (event.headers && (event.headers['x-forwarded-proto'] || event.headers['x-forwarded-protocol'])) || 'https';
    const detectedHost = (event.headers && (event.headers['host'] || event.headers['x-forwarded-host'])) || '';
    const inferredBase = detectedHost ? `${detectedProto}://${detectedHost}/.netlify/functions/proxy` : '';
    const proxyBase = process.env.PROXY_BASE || inferredBase;

    // runtime script to rewrite dynamic requests (fetch, XHR) and DOM-added resources to route through proxy
    const runtime = `\n<script>\n(function(){\n  try{\n    var __proxyBase = '${proxyBase}';\n    function proxify(u){ if(!__proxyBase) return u; try{ if(!u) return u; if(typeof u !== 'string') return u; if(u.indexOf('http')!==0) return u; if(u.indexOf(location.origin)===0) return u; return __proxyBase + '?url=' + encodeURIComponent(u); }catch(e){return u;} }\n    // patch fetch\n    var _fetch = window.fetch; if(_fetch){ window.fetch = function(input, init){ try{ var url = (typeof input === 'string')? input : (input && input.url ? input.url : ''); if(url && url.indexOf('http')===0 && url.indexOf(location.origin)!==0){ var target = proxify(url); if(typeof input === 'string') return _fetch.call(this, target, init); else{ var newReq = new Request(target, input); return _fetch.call(this, newReq, init); } } }catch(e){} return _fetch.call(this, input, init); }; }\n    // patch XHR\n    (function(){ var X = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function(method, url){ try{ if(url && url.indexOf('http')===0 && url.indexOf(location.origin)!==0){ arguments[1] = proxify(url); } }catch(e){} return X.apply(this, arguments); }; })();\n    // patch setAttribute for dynamic elements\n    var _set = Element.prototype.setAttribute; Element.prototype.setAttribute = function(name, value){ try{ if((name==='src' || name==='href' || name==='data-src') && typeof value === 'string' && value.indexOf('http')===0 && value.indexOf(location.origin)!==0){ value = proxify(value); } }catch(e){} return _set.call(this, name, value); };\n    // patch appendChild to rewrite attributes on newly appended elements\n    var _append = Node.prototype.appendChild; Node.prototype.appendChild = function(child){ try{ if(child && child.getAttribute){ ['src','href','data-src'].forEach(function(attr){ try{ var v = child.getAttribute(attr); if(v && typeof v === 'string' && v.indexOf('http')===0 && v.indexOf(location.origin)!==0){ child.setAttribute(attr, proxify(v)); } }catch(e){} }); } }catch(e){} return _append.call(this, child); };\n  }catch(e){}\n})();\n</script>\n`;

    text = text.replace(/<head(.*?)>/i, match => match + injectBase + runtime);

    // Remove meta CSP tags (prevent inline/script blocks from being blocked)
    text = text.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
    text = text.replace(/<meta[^>]+name=["']?Content-Security-Policy["']?[^>]*>/gi, '');

    // Rewrite absolute resource references (src, data-src, srcset, link[href], CSS url()) to go through our proxy
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
