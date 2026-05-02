export const onRequest: PagesFunction = async (context) => {
  // OPTIONS 预检
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const url = new URL(context.request.url);
  const targetPath = url.pathname.replace('/api/binance', '');
  const targetUrl = `https://api.binance.com${targetPath}${url.search}`;

  try {
    const response = await fetch(targetUrl, {
      method: context.request.method,
      headers: { 'Content-Type': 'application/json' },
    });

    const body = await response.text();
    console.log(`[binance-proxy] ${context.request.method} ${targetPath} → ${response.status}`);

    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[binance-proxy] ERROR ${targetPath}: ${msg}`);
    return new Response(JSON.stringify({ error: 'Binance 代理请求失败', detail: msg }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};
