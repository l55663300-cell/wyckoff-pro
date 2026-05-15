/**
 * LLM Provider 抽象层
 * 支持一切切换 DeepSeek / OpenAI / Claude / Gemini 等
 *
 * 安全设计（v2）：
 *  - 生产环境：所有请求走 /api/llm Cloudflare Worker 代理，Key 存于 CF 环境变量，不出浏览器
 *  - 开发环境：代理 404/503 时抛出明确错误，不再降级为前端直连以防 Key 泄漏
 *  - localStorage 中的 LLM 配置仅保存 provider/model/参数，不保存 apiKey
 */

export type LLMProvider = 'deepseek' | 'openai' | 'claude' | 'gemini';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;        // 仅开发调试时使用，生产环境 Key 存于 CF 环境变量
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
 * 读取当前 LLM 配置（provider/model/参数，不含 apiKey）
 * 生产环境 Key 存于 Cloudflare 环境变量，前端无需持有
 */
export function getLLMConfig(): LLMConfig | null {
  try {
    const raw = localStorage.getItem('wyckoff_llm_config');
    if (raw) {
      const cfg = JSON.parse(raw) as Partial<LLMConfig>;
      if (cfg.provider) {
        const defaults = PROVIDER_DEFAULTS[cfg.provider];
        return {
          provider: cfg.provider,
          model: cfg.model ?? defaults.model,
          baseUrl: cfg.baseUrl ?? defaults.baseUrl,
          maxTokens: cfg.maxTokens ?? 800,
          temperature: cfg.temperature ?? 0.3,
          // 不读取 apiKey，即使老数据里有也忽略
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveLLMConfig(cfg: LLMConfig): void {
  // 明确不保存 apiKey，Key 只存 Cloudflare 环境变量
  const { apiKey: _omit, ...safe } = cfg;
  localStorage.setItem('wyckoff_llm_config', JSON.stringify(safe));
}

export function clearLLMConfig(): void {
  localStorage.removeItem('wyckoff_llm_config');
}

/**
 * 统一调用接口 — 所有请求走 /api/llm 后端代理（Key 存于 Cloudflare 环境变量）
 * 不再提供前端直连降级，防止 API Key 泄漏
 */
export async function callLLM(
  messages: LLMMessage[],
  config?: LLMConfig,
): Promise<LLMResponse> {
  return callLLMProxy(messages, config?.provider, config?.model, config?.maxTokens, config?.temperature);
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

