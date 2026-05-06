/**
 * NowPayments IPN（Instant Payment Notification）Webhook 接收器
 *
 * POST /api/nowpayments/webhook
 *
 * 流程：
 *   NowPayments 链上确认 → POST 此接口 → 验签 → 写 Supabase 开通订阅
 *
 * Cloudflare Pages 环境变量（Dashboard → Settings → Environment variables）：
 *   NOWPAYMENTS_IPN_SECRET  = aAgHUwxxHKtPXjXYV1Sw9VRXTbGrd/yb
 *   SUPABASE_URL            = https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY    = eyJ...（service_role key，有完整写权限，绕过 RLS）
 */

interface Env {
  NOWPAYMENTS_IPN_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
}

interface NowPaymentsIPN {
  payment_id: number;
  payment_status: string;   // 'finished' | 'confirmed' | 'partially_paid' | ...
  order_id: string;         // 我们自己传的 order_id，格式 SO1234567890
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  actually_paid: number;
  outcome_amount?: number;
  outcome_currency?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-nowpayments-sig',
};

/** HMAC-SHA512 验签 */
async function verifySignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign'],
    );
    // NowPayments 要求对排序后的 JSON body 签名
    const parsed = JSON.parse(body);
    const sortedBody = JSON.stringify(parsed, Object.keys(parsed).sort());
    const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(sortedBody));
    const computed = Array.from(new Uint8Array(sigBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return computed.toLowerCase() === signature.toLowerCase();
  } catch {
    return false;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const ipnSecret = context.env.NOWPAYMENTS_IPN_SECRET;
  const supabaseUrl = context.env.SUPABASE_URL;
  const supabaseKey = context.env.SUPABASE_SERVICE_KEY;

  if (!ipnSecret || !supabaseUrl || !supabaseKey) {
    console.error('[nowpayments/webhook] 环境变量未配置');
    return new Response('Config error', { status: 503 });
  }

  const rawBody = await context.request.text();
  const signature = context.request.headers.get('x-nowpayments-sig') ?? '';

  // 验签
  const valid = await verifySignature(rawBody, signature, ipnSecret);
  if (!valid) {
    console.warn('[nowpayments/webhook] 签名验证失败');
    return new Response('Unauthorized', { status: 401 });
  }

  let ipn: NowPaymentsIPN;
  try {
    ipn = JSON.parse(rawBody) as NowPaymentsIPN;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  console.log(`[nowpayments/webhook] order_id=${ipn.order_id} status=${ipn.payment_status}`);

  // 只处理"已完成"状态
  const FINISHED_STATUSES = ['finished', 'confirmed'];
  if (!FINISHED_STATUSES.includes(ipn.payment_status)) {
    console.log(`[nowpayments/webhook] 状态 ${ipn.payment_status} 不处理，直接返回 200`);
    return new Response('OK', { status: 200 });
  }

  // 查询订单
  const orderId = ipn.order_id;
  const orderResp = await fetch(
    `${supabaseUrl}/rest/v1/subscription_orders?id=eq.${orderId}&select=*`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!orderResp.ok) {
    console.error(`[nowpayments/webhook] 查订单失败 ${orderResp.status}`);
    return new Response('DB error', { status: 500 });
  }

  const orders = await orderResp.json() as Record<string, unknown>[];
  if (!orders.length) {
    console.warn(`[nowpayments/webhook] 订单不存在: ${orderId}`);
    return new Response('Order not found', { status: 404 });
  }

  const order = orders[0];

  // 幂等：已经 confirmed 就跳过
  if (order.status === 'confirmed') {
    console.log(`[nowpayments/webhook] 订单 ${orderId} 已处理，跳过`);
    return new Response('OK', { status: 200 });
  }

  // 查询套餐信息（获取 duration_days / daily_limit / hourly_limit）
  const planResp = await fetch(
    `${supabaseUrl}/rest/v1/subscription_plans?id=eq.${order.plan_id}&select=*`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    },
  );

  const plans = planResp.ok ? await planResp.json() as Record<string, unknown>[] : [];
  const plan = plans[0];

  if (!plan) {
    console.error(`[nowpayments/webhook] 套餐不存在: ${order.plan_id}`);
    return new Response('Plan not found', { status: 404 });
  }

  const now = new Date();
  const expireAt = new Date(now.getTime() + Number(plan.duration_days) * 86400_000).toISOString();

  // 更新订单状态为 confirmed
  await fetch(
    `${supabaseUrl}/rest/v1/subscription_orders?id=eq.${orderId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        status: 'confirmed',
        confirmed_at: now.toISOString(),
        admin_note: `NowPayments 自动确认，payment_id=${ipn.payment_id}`,
        tx_hash: String(ipn.payment_id),
      }),
    },
  );

  // 开通/更新订阅
  const subPayload = {
    uid: order.uid,
    plan_id: plan.id,
    plan_name: order.plan_name,
    cycle: order.cycle,
    daily_limit: Number(plan.daily_limit),
    hourly_limit: Number(plan.hourly_limit),
    start_at: now.toISOString(),
    expire_at: expireAt,
    daily_used: 0,
    hourly_used: 0,
    last_used_date: '',
    last_used_hour: -1,
  };

  await fetch(
    `${supabaseUrl}/rest/v1/user_subscriptions`,
    {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(subPayload),
    },
  );

  // 给用户发站内通知
  await fetch(
    `${supabaseUrl}/rest/v1/notifications`,
    {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        uid: order.uid,
        title: '🎉 订阅已自动开通',
        body: `您的 ${order.plan_name} 已成功开通，有效期至 ${expireAt.slice(0, 10)}，立即开始使用吧！`,
        type: 'system',
        is_read: false,
        created_at: now.toISOString(),
      }),
    },
  );

  console.log(`[nowpayments/webhook] 订单 ${orderId} 自动开通成功，expire_at=${expireAt}`);
  return new Response('OK', { status: 200 });
};
