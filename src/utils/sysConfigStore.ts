/**
 * sysConfigStore — 全局系统配置（后台可编辑，前台实时读取）
 */

const LS_KEY = 'wyckoff_sys_config_v1';

export interface SysConfig {
  siteName: string;
  supportEmail: string;
  supportWeChat?: string;       // 客服微信号
  supportNote?: string;         // 客服补充说明（如"工作日9-18时响应"）
  /** 订阅说明文本，显示在订阅页付款步骤，支持换行（\n） */
  subscriptionNote: string;
  /** 审核时效说明 */
  reviewTimeNote: string;
  /** 是否开放注册 */
  registrationOpen: boolean;
  /** 维护模式 */
  maintenanceMode: boolean;
  /** 新用户注册赠送每日次数（免费试用套餐 dailyLimit） */
  freeTrialDailyLimit: number;
  /** 新用户注册赠送有效天数 */
  freeTrialDays: number;
}

const DEFAULT_CONFIG: SysConfig = {
  siteName: 'AI威科夫Pro',
  supportEmail: 'support@wyckoff.pro',
  supportWeChat: '',
  supportNote: '工作日 09:00–18:00 响应',
  subscriptionNote:
    '• 提交订单后，请耐心等待管理员审核。\n• 审核通过后订阅立即生效，到期前续费可顺延。\n• 不支持退款，如有问题请联系客服邮箱或微信。\n• 请确保转账网络与钱包一致，否则资产将永久丢失。',
  reviewTimeNote: '工作日 2 小时内审核，节假日可能延迟',
  registrationOpen: true,
  maintenanceMode: false,
  freeTrialDailyLimit: 5,
  freeTrialDays: 7,
};

export function loadSysConfig(): SysConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function saveSysConfig(cfg: Partial<SysConfig>) {
  const current = loadSysConfig();
  localStorage.setItem(LS_KEY, JSON.stringify({ ...current, ...cfg }));
}
