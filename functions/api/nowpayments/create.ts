/**
 * NowPayments 创建支付订单代理
 *
 * POST /api/nowpayments/create
 * Body: { price_amount, order_id, order_description, payer_email }
 *
 * Cloudflare Pages 环境变量（Dashboard → Settings → Environment variables）：
 *   NOWPAYMENTS_API_KEY = J18X4MB-S7QMSK5-PDZ2VRV-Y20GSTH
 */

interface Env {
  NOWPAYMENTS_API_KEY?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '仅支持 POST' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const apiKey = context.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'NOWPAYMENTS_API_KEY 未配置' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  let body: {
    price_amount: number;
    order_id: string;
    order_description: string;
    payer_email: string;
  };
  try {
    body = await context.request.json() as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: '请求体格式错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 调用 NowPayments 创建支付（TRC20 USDT）
  const payload = {
    price_amount: body.price_amount,
    price_currency: 'usd',
    pay_currency: 'usdttrc20',
    order_id: body.order_id,
    order_description: body.order_description,
    ipn_callback_url: 'https://wyckoff-pro.pages.dev/api/nowpayments/webhook',
    is_fixed_rate: true,
    is_fee_paid_by_user: false,
  };

  console.log(`[nowpayments/create] order_id=${body.order_id} amount=${body.price_amount}`);

  try {
    const resp = await fetch('https://api.nowpayments.io/v1/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    console.log(`[nowpayments/create] upstream status=${resp.status}`);

    if (!resp.ok) {
      console.error(`[nowpayments/create] error: ${text.slice(0, 300)}`);
      return new Response(JSON.stringify({ error: `NowPayments 错误 [${resp.status}]`, detail: text }), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[nowpayments/create] fetch error: ${msg}`);
    return new Response(JSON.stringify({ error: '代理请求失败', detail: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
};
