/**
 * 信号推送邮件 Function（Cloudflare Pages Function）
 *
 * 当出现 SOS + 多头共振等信号时，服务端发邮件通知用户
 *
 * CF 环境变量：
 *   RESEND_API_KEY = re_SNYgsZEf_Ez6Gjo8F4LYMqhgR9nUSbdxa
 *   EMAIL_FROM     = noreply@wkfpro.com（或 onboarding@resend.dev）
 *
 * 请求格式：POST /api/email/signal-alert
 * Body: {
 *   to: string,          // 接收邮箱
 *   symbol: string,      // 币种，如 BTCUSDT
 *   timeframe: string,   // 周期，如 1H
 *   direction: 'long' | 'short',
 *   score: number,       // 0-100
 *   probability: number, // 0-100
 *   phase: string,       // 威科夫阶段
 *   price: number,
 *   entryLow?: number,
 *   entryHigh?: number,
 *   stopLoss?: number,
 *   target1?: number,
 *   riskReward?: number,
 * }
 */

interface Env {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

interface SignalAlertRequest {
  to: string;
  symbol: string;
  timeframe: string;
  direction: 'long' | 'short';
  score: number;
  probability: number;
  phase: string;
  price: number;
  entryLow?: number;
  entryHigh?: number;
  stopLoss?: number;
  target1?: number;
  riskReward?: number;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function signalHtml(req: SignalAlertRequest): string {
  const dirLabel = req.direction === 'long' ? '▲ 做多' : '▼ 做空';
  const dirColor = req.direction === 'long' ? '#00c896' : '#ff4d6d';
  const sym = req.symbol.replace('USDT', '/USDT');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#161b22;border-radius:12px;overflow:hidden;border:1px solid #30363d">
    <div style="background:linear-gradient(135deg,#1a2744,#0d2137);padding:24px 32px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#4d9fff;letter-spacing:1px">WYCKOFF PRO</div>
      <div style="color:#8b949e;font-size:12px;margin-top:4px">AI信号推送通知</div>
    </div>
    <div style="padding:28px 32px">
      <div style="background:#0d1117;border-radius:10px;padding:20px 24px;margin-bottom:20px;border-left:3px solid ${dirColor}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-size:20px;font-weight:800;color:#e6edf3">${sym} · ${req.timeframe}</div>
          <div style="font-size:14px;font-weight:700;color:${dirColor};background:${req.direction === 'long' ? 'rgba(0,200,150,0.12)' : 'rgba(255,77,109,0.12)'};padding:4px 12px;border-radius:8px">${dirLabel}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div style="text-align:center">
            <div style="font-size:11px;color:#8b949e;margin-bottom:4px">综合评分</div>
            <div style="font-size:22px;font-weight:800;color:#f0b429">${req.score}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:11px;color:#8b949e;margin-bottom:4px">概率</div>
            <div style="font-size:22px;font-weight:800;color:${dirColor}">${req.probability}%</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:11px;color:#8b949e;margin-bottom:4px">当前价</div>
            <div style="font-size:18px;font-weight:700;color:#e6edf3">$${req.price.toLocaleString()}</div>
          </div>
        </div>
        <div style="font-size:12px;color:#8b949e">威科夫阶段：<span style="color:#e6edf3">${req.phase}</span></div>
      </div>
      ${req.entryLow ? `
      <div style="background:#0d1117;border-radius:10px;padding:16px 20px;margin-bottom:20px">
        <div style="font-size:13px;font-weight:600;color:#e6edf3;margin-bottom:10px">交易参数</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
          ${req.entryLow ? `<div><span style="color:#8b949e">入场区间：</span><span style="color:#e6edf3">$${req.entryLow} ~ $${req.entryHigh ?? '-'}</span></div>` : ''}
          ${req.stopLoss ? `<div><span style="color:#8b949e">止损位：</span><span style="color:#ff4d6d">$${req.stopLoss}</span></div>` : ''}
          ${req.target1 ? `<div><span style="color:#8b949e">目标1：</span><span style="color:#00c896">$${req.target1}</span></div>` : ''}
          ${req.riskReward ? `<div><span style="color:#8b949e">盈亏比：</span><span style="color:#f0b429">${req.riskReward}:1</span></div>` : ''}
        </div>
      </div>
      ` : ''}
      <a href="https://wkfpro.com" style="display:block;background:linear-gradient(135deg,#f0b429,#e8920a);color:#000;text-decoration:none;padding:12px;border-radius:8px;font-size:14px;font-weight:700;text-align:center">
        打开分析详情 →
      </a>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #30363d;text-align:center">
      <p style="color:#484f58;font-size:11px;margin:0">
        本邮件由 Wyckoff Pro 信号系统自动发送 · <a href="https://wkfpro.com" style="color:#4d9fff;text-decoration:none">wkfpro.com</a>
      </p>
      <p style="color:#484f58;font-size:11px;margin:4px 0 0">仅供参考，不构成投资建议。市场有风险，交易需谨慎。</p>
    </div>
  </div>
</body>
</html>`;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (context.request.method !== 'POST') {
    return json({ error: '仅支持 POST 请求' }, 405);
  }

  const apiKey = context.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[signal-alert] RESEND_API_KEY 未配置');
    return json({ error: '邮件服务未配置' }, 503);
  }

  const from = context.env.EMAIL_FROM ?? 'Wyckoff Pro <onboarding@resend.dev>';

  let body: SignalAlertRequest;
  try {
    body = await context.request.json() as SignalAlertRequest;
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }

  const { to, symbol, direction, score, probability } = body;
  if (!to || !symbol || !direction || score === undefined || probability === undefined) {
    return json({ error: '缺少必填字段' }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json({ error: '邮箱格式不正确' }, 400);
  }

  const dirLabel = direction === 'long' ? '▲ 做多' : '▼ 做空';
  const sym = symbol.replace('USDT', '/USDT');
  const subject = `🚨 [Wyckoff Pro] ${sym} ${dirLabel} 信号 · 评分 ${score} · 概率 ${probability}%`;
  const html = signalHtml(body);

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    const data = await resp.json() as { id?: string; name?: string; message?: string };
    console.log(`[signal-alert] to=${to} symbol=${symbol} status=${resp.status} id=${data.id ?? '-'}`);

    if (!resp.ok) {
      console.error(`[signal-alert] Resend error: ${JSON.stringify(data)}`);
      return json({ error: `邮件发送失败: ${data.message ?? data.name ?? '未知错误'}` }, 502);
    }

    return json({ ok: true, id: data.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[signal-alert] fetch error: ${msg}`);
    return json({ error: '邮件服务请求失败', detail: msg }, 502);
  }
};
