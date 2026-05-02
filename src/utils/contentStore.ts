/**
 * contentStore — 前端内容配置的 localStorage 持久化
 * key: wyckoff_content
 */

export interface SiteContent {
  hero: {
    title: string;
    subtitle: string;
    ctaText: string;
    ctaSubText: string;
  };
  banner: {
    enabled: boolean;
    text: string;
    linkText: string;
  };
  pricing: {
    oneTimePacks: { count: number; price: number; label?: string }[];
  };
}

const LS_KEY = 'wyckoff_content';

export const DEFAULT_CONTENT: SiteContent = {
  hero: {
    title: '用 AI 读懂威科夫筹码的秘密',
    subtitle: '基于实时行情数据 + DeepSeek AI，提供专业的威科夫阶段识别、风控计划与个性化策略建议',
    ctaText: '🎯 立即开始分析',
    ctaSubText: '注册即送 5 次免费体验',
  },
  banner: {
    enabled: true,
    text: '🎉 新用户注册即送 5 次免费 AI 策略分析 · 首充立享最高 30% 额外次数加赠',
    linkText: '立即领取',
  },
  pricing: {
    oneTimePacks: [
      { count: 20,  price: 18 },
      { count: 50,  price: 38 },
      { count: 100, price: 58 },
      { count: 300, price: 128 },
      { count: 500, price: 168 },
    ],
  },
};

export function loadContent(): SiteContent {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_CONTENT;
    return { ...DEFAULT_CONTENT, ...JSON.parse(raw) } as SiteContent;
  } catch { return DEFAULT_CONTENT; }
}

export function saveContent(content: SiteContent) {
  localStorage.setItem(LS_KEY, JSON.stringify(content));
}

export function savePartialContent(patch: Partial<SiteContent>) {
  const current = loadContent();
  saveContent({ ...current, ...patch });
}
