/**
 * LLM Provider 抽象层
 * 支持一键切换 DeepSeek / OpenAI / Claude / Gemini 等
 *
 * 配置优先级：
 *  1. 前端通过 Admin 后台写入 localStorage（仅原型/演示用）
 *  2. 生产环境：Cloudflare Pages Function 环境变量 LLM_API_KEY / LLM_MODEL
 */

export type LLMProvider = 'deepseek' | 'openai' | 'claude' | 'gemini';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;       // 自定义代理地址
  maxTokens?: number;
  temperature?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/** 各 Provider 默认配置 */
const PROVIDER_DEFAULTS: Record<LLMProvider, { baseUrl: string; model: string }> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
  claude: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-20241022',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-1.5-pro',
  },
};

/**
 * 读取当前 LLM 配置
 * 原型阶段从 localStorage 读取；生产环境由服务端注入
 */
export function getLLMConfig(): LLMConfig | null {
  try {
    const raw = localStorage.getItem('wyckoff_llm_config');
    if (raw) {
      const cfg = JSON.parse(raw) as Partial<LLMConfig>;
      if (cfg.provider && cfg.apiKey) {
        const defaults = PROVIDER_DEFAULTS[cfg.provider];
        return {
          provider: cfg.provider,
          apiKey: cfg.apiKey,
          model: cfg.model ?? defaults.model,
          baseUrl: cfg.baseUrl ?? defaults.baseUrl,
          maxTokens: cfg.maxTokens ?? 2000,
          temperature: cfg.temperature ?? 0.3,
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveLLMConfig(cfg: LLMConfig): void {
  localStorage.setItem('wyckoff_llm_config', JSON.stringify(cfg));
}

export function clearLLMConfig(): void {
  localStorage.removeItem('wyckoff_llm_config');
}

/**
 * 统一调用接口（OpenAI 兼容格式，DeepSeek / OpenAI 均支持）
 * Claude / Gemini 需要各自适配格式，此处已处理
 *
 * 调用优先级：
 *  1. 生产环境：通过 /api/llm 后端代理（Key 存于 Cloudflare 环境变量，不暴露在前端）
 *  2. 开发/降级：从 localStorage 读取 Key 直接调用（仅个人本地使用）
 */
export async function callLLM(
  messages: LLMMessage[],
  config?: LLMConfig,
): Promise<LLMResponse> {
  // 优先尝试后端代理（生产环境 Cloudflare Pages Function）
  try {
    const probeResp = await callLLMProxy(messages, config?.provider, config?.model, config?.maxTokens, config?.temperature);
    return probeResp;
  } catch (proxyErr) {
    // 代理不可用（开发环境无此路由）时降级到直连
    const isDevFallback = proxyErr instanceof Error && (
      proxyErr.message.includes('503') ||
      proxyErr.message.includes('未配置') ||
      proxyErr.message.includes('Failed to fetch') ||
      proxyErr.message.includes('404')
    );
    if (!isDevFallback) throw proxyErr; // 真实错误不降级，直接抛出
  }

  // 降级：开发环境直连（Key 从 localStorage 读取）
  const cfg = config ?? getLLMConfig();
  if (!cfg) throw new Error('LLM未配置，请在管理员后台设置 API Key');

  switch (cfg.provider) {
    case 'deepseek':
    case 'openai':
      return callOpenAICompat(messages, cfg);
    case 'claude':
      return callClaude(messages, cfg);
    case 'gemini':
      return callGemini(messages, cfg);
    default:
      throw new Error(`不支持的 Provider: ${cfg.provider}`);
  }
}

/**
 * 通过后端代理调用 LLM（生产环境，Key 不出浏览器）
 * 对应 functions/api/llm/index.ts
 */
async function callLLMProxy(
  messages: LLMMessage[],
  provider?: string,
  model?: string,
  maxTokens?: number,
  temperature?: number,
): Promise<LLMResponse> {
  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, provider, model, max_tokens: maxTokens, temperature }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM代理错误 [${res.status}]: ${err}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    model: data.model ?? model ?? 'unknown',
    usage: data.usage,
  };
}

/** OpenAI 兼容格式（DeepSeek / OpenAI 通用） */
async function callOpenAICompat(messages: LLMMessage[], cfg: LLMConfig): Promise<LLMResponse> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: cfg.maxTokens ?? 2000,
      temperature: cfg.temperature ?? 0.3,
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API 错误 [${res.status}]: ${err}`);
  }

  const data = await res.json();
  return {
    content: data.choices[0]?.message?.content ?? '',
    model: data.model ?? cfg.model,
    usage: data.usage,
  };
}

/** Claude (Anthropic) Messages API */
async function callClaude(messages: LLMMessage[], cfg: LLMConfig): Promise<LLMResponse> {
  const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
  const userMsgs = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch(`${cfg.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      system: systemMsg,
      messages: userMsgs,
      max_tokens: cfg.maxTokens ?? 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API 错误 [${res.status}]: ${err}`);
  }

  const data = await res.json();
  return {
    content: data.content[0]?.text ?? '',
    model: data.model ?? cfg.model,
    usage: data.usage ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens } : undefined,
  };
}

/** Gemini generateContent API */
async function callGemini(messages: LLMMessage[], cfg: LLMConfig): Promise<LLMResponse> {
  const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
  const userText = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');

  const res = await fetch(
    `${cfg.baseUrl}/models/${cfg.model}:generateContent?key=${cfg.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemMsg }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { maxOutputTokens: cfg.maxTokens ?? 2000, temperature: cfg.temperature ?? 0.3 },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API 错误 [${res.status}]: ${err}`);
  }

  const data = await res.json();
  return {
    content: data.candidates[0]?.content?.parts[0]?.text ?? '',
    model: cfg.model,
  };
}
