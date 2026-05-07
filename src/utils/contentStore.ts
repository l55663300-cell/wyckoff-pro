/**
 * contentStore — 前端内容配置持久化
 * v2: 主存 Supabase site_config 表（key='site_content'），localStorage 作缓存
 */

import { supabase } from '../lib/supabase';

const LS_KEY = 'wyckoff_content';
const DB_KEY = 'site_content';

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

// ─── 同步读（优先 localStorage 缓存） ────────────────────────────────────────

export function loadContent(): SiteContent {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_CONTENT;
    return { ...DEFAULT_CONTENT, ...JSON.parse(raw) } as SiteContent;
  } catch { return DEFAULT_CONTENT; }
}

// ─── 异步读（从 Supabase 拉取最新，回写 localStorage） ───────────────────────

export async function fetchContent(): Promise<SiteContent> {
  try {
    const { data, error } = await supabase
      .from('site_config')
      .select('value')
      .eq('key', DB_KEY)
      .single();
    if (!error && data?.value) {
      const merged = { ...DEFAULT_CONTENT, ...(data.value as Partial<SiteContent>) };
      try { localStorage.setItem(LS_KEY, JSON.stringify(merged)); } catch {}
      return merged;
    }
  } catch (e) {
    console.warn('[contentStore] Supabase 读取失败，降级到 localStorage:', e);
  }
  return loadContent();
}

// ─── 写（同时更新 localStorage + 异步写 Supabase） ───────────────────────────

export function saveContent(content: SiteContent) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(content)); } catch {}

  void supabase
    .from('site_config')
    .upsert({ key: DB_KEY, value: content, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.error('[contentStore] Supabase 写入失败:', error.message);
    });
}

export function savePartialContent(patch: Partial<SiteContent>) {
  const current = loadContent();
  saveContent({ ...current, ...patch });
}

// ─── 管理员专用：强制写并等待结果 ────────────────────────────────────────────

export async function saveContentAsync(content: SiteContent): Promise<boolean> {
  try { localStorage.setItem(LS_KEY, JSON.stringify(content)); } catch {}

  const { error } = await supabase
    .from('site_config')
    .upsert({ key: DB_KEY, value: content, updated_at: new Date().toISOString() });
  if (error) {
    console.error('[contentStore] Supabase 写入失败:', error.message);
    return false;
  }
  return true;
}
