/**
 * LLM 代理 Function（Cloudflare Pages Function）
 *
 * 安全设计：
 * - LLM API Key 存于 Cloudflare 环境变量（LLM_API_KEY / LLM_MODEL / LLM_BASE_URL）
 * - 前端只传 messages + provider，不传 Key
 * - 生产环境使用此接口；开发环境仍可用 localhost localStorage 方式
 *
 * Cloudflare Pages 环境变量配置（在 CF Dashboard → Settings → Environment variables）：
 *   LLM_API_KEY   = sk-xxxx
 *   LLM_BASE_URL  = https://api.deepseek.com/v1   （或其他 OpenAI 兼容地址）
 *   LLM_MODEL     = deepseek-chat
 *   LLM_MAX_TOKENS= 2000   （可选，默认 2000）
 */

interface Env {
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  LLM_MAX_TOKENS?: string;
}

interface LLMRequestBody {
  messages: Array<{ role: string; content: string }>;
  provider?: string;   // 用于日志，不影响路由
  model?: string;      // 可覆盖环境变量中的模型
  max_tokens?: number;
  temperature?: number;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequest: PagesFunction<Env> = async (context) => {
  // OPTIONS 预检
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '仅支持 POST 请求' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 读取环境变量中的 Key
  const apiKey = context.env.LLM_API_KEY;
  if (!apiKey) {
    console.error('[llm-proxy] LLM_API_KEY 环境变量未配置');
    return new Response(JSON.stringify({ error: 'LLM 服务未配置，请联系管理员' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const baseUrl = context.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1';
  const defaultModel = context.env.LLM_MODEL ?? 'deepseek-chat';
  const defaultMaxTokens = parseInt(context.env.LLM_MAX_TOKENS ?? '2000', 10);

  let body: LLMRequestBody;
  try {
    body = await context.request.json() as LLMRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: '请求体格式错误，需要 JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages 字段不能为空' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const model = body.model ?? defaultModel;
  const maxTokens = body.max_tokens ?? defaultMaxTokens;
  const temperature = body.temperature ?? 0.3;

  console.log(`[llm-proxy] provider=${body.provider ?? 'unknown'} model=${model} messages=${body.messages.length}`);

  try {
    const llmResp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: body.messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
    });

    const respText = await llmResp.text();
    console.log(`[llm-proxy] upstream status=${llmResp.status}`);

    if (!llmResp.ok) {
      console.error(`[llm-proxy] upstream error: ${respText.slice(0, 200)}`);
      return new Response(JSON.stringify({ error: `LLM 上游错误 [${llmResp.status}]`, detail: respText }), {
        status: llmResp.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    return new Response(respText, {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[llm-proxy] fetch error: ${msg}`);
    return new Response(JSON.stringify({ error: 'LLM 代理请求失败', detail: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
};
