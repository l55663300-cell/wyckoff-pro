/**
 * sysConfigStore — 全局系统配置（后台可编辑，前台实时读取）
 * v2: 主存 Supabase site_config 表，localStorage 作一级缓存
 */

import { supabase } from '../lib/supabase';

const LS_KEY = 'wyckoff_sys_config_v1';
const DB_KEY = 'sys_config';

export interface SysConfig {
  siteName: string;
  supportEmail: string;
  supportWeChat?: string;
  supportNote?: string;
  subscriptionNote: string;
  reviewTimeNote: string;
  paymentNote: string;
  registrationOpen: boolean;
  maintenanceMode: boolean;
  freeTrialDailyLimit: number;
  freeTrialDays: number;
  adminNotifyEmail?: string;
  adminNotifySendKey?: string;
  inviterRewardCredits: number;
  inviteeRewardCredits: number;
  inviteRewardCap: number;
  loginLockThreshold: number;
  loginLockMinutes: number;
  apiRateLimitPerMin: number;
  aiQueryLimitPerHour: number;
  autoPayEnabled: boolean;
}

const DEFAULT_CONFIG: SysConfig = {
  siteName: 'AI威科夫Pro',
  supportEmail: 'support@wkfpro.com',
  supportWeChat: '',
  supportNote: '工作日 09:00–18:00 响应',
  subscriptionNote:
    '• 提交订单后，请耐心等待管理员审核。\n• 审核通过后订阅立即生效，到期前续费可顺延。\n• 不支持退款，如有问题请联系客服邮箱或微信。\n• 请确保转账网络与钱包一致，否则资产将永久丢失。',
  reviewTimeNote: '工作日 2 小时内审核，节假日可能延迟',
  paymentNote:
    '📌 请向上方对应网络地址转账对应金额 USDT\n📧 转账备注请填写您的注册邮箱\n⚠️ 请确认网络类型与钱包一致，否则资产将永久丢失',
  registrationOpen: true,
  maintenanceMode: false,
  freeTrialDailyLimit: 3,
  freeTrialDays: 3,
  adminNotifyEmail: '',
  adminNotifySendKey: '',
  inviterRewardCredits: 10,
  inviteeRewardCredits: 5,
  inviteRewardCap: 500,
  loginLockThreshold: 5,
  loginLockMinutes: 30,
  apiRateLimitPerMin: 60,
  aiQueryLimitPerHour: 100,
  autoPayEnabled: false,
};

// ─── 同步读（优先 localStorage 缓存，用于非关键路径） ─────────────────────────

export function loadSysConfig(): SysConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

// ─── 异步读（从 Supabase 拉取最新，回写 localStorage） ───────────────────────

export async function fetchSysConfig(): Promise<SysConfig> {
  try {
    const { data, error } = await supabase
      .from('site_config')
      .select('value')
      .eq('key', DB_KEY)
      .single();
    if (!error && data?.value) {
      const merged = { ...DEFAULT_CONFIG, ...(data.value as Partial<SysConfig>) };
      try { localStorage.setItem(LS_KEY, JSON.stringify(merged)); } catch {}
      return merged;
    }
  } catch (e) {
    console.warn('[sysConfigStore] Supabase 读取失败，降级到 localStorage:', e);
  }
  return loadSysConfig();
}

// ─── 写（同时更新 localStorage + Supabase） ───────────────────────────────────

export function saveSysConfig(cfg: Partial<SysConfig>) {
  const current = loadSysConfig();
  const next = { ...current, ...cfg };
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}

  // 异步写 Supabase（管理员调用，失败打印日志）
  void supabase
    .from('site_config')
    .upsert({ key: DB_KEY, value: next, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.error('[sysConfigStore] Supabase 写入失败:', error.message);
    });
}

// ─── 管理员专用：强制写并等待结果 ────────────────────────────────────────────

export async function saveSysConfigAsync(cfg: Partial<SysConfig>): Promise<boolean> {
  const current = loadSysConfig();
  const next = { ...current, ...cfg };
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}

  const { error } = await supabase
    .from('site_config')
    .upsert({ key: DB_KEY, value: next, updated_at: new Date().toISOString() });
  if (error) {
    console.error('[sysConfigStore] Supabase 写入失败:', error.message);
    return false;
  }
  return true;
}
