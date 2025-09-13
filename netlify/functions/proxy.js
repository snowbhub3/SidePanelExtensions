const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async function(event, context) {
  const target = (event.queryStringParameters && event.queryStringParameters.url) || '';
  if (!target) {
    return { statusCode: 400, body: 'Missing url parameter' };
  }

  try {
    const res = await fetch(target, { redirect: 'follow' });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      // For non-HTML, just proxy as-is
      const buffer = await res.arrayBuffer();
      return {
        statusCode: 200,
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'X-Frame-Options': 'ALLOWALL'
        },
        body: Buffer.from(buffer).toString('base64'),
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

    // Remove X-Frame-Options and CSP from response headers by ignoring them in our response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // allow embedding
        'X-Frame-Options': 'ALLOWALL',
        'Access-Control-Allow-Origin': '*'
      },
      body: text
    };
  } catch (err) {
    return { statusCode: 500, body: 'Fetch error: ' + String(err) };
  }
};
