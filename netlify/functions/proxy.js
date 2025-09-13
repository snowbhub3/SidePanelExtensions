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
      // For non-HTML, proxy as binary
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
