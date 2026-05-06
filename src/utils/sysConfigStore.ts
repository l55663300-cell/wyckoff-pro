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
  /** 转账提示文字（显示在付款步骤钱包地址下方，支持换行\n） */
  paymentNote: string;
  /** 是否开放注册 */
  registrationOpen: boolean;
  /** 维护模式 */
  maintenanceMode: boolean;
  /** 新用户注册赠送每日次数（免费试用套餐 dailyLimit） */
  freeTrialDailyLimit: number;
  /** 新用户注册赠送有效天数 */
  freeTrialDays: number;
  /** 管理员通知邮箱（充值订单到来时发邮件提醒） */
  adminNotifyEmail?: string;
  /** 管理员微信推送 Server酱 SendKey（充值订单到来时推送微信） */
  adminNotifySendKey?: string;
  /** 邀请人奖励次数（被邀请人首充后发放） */
  inviterRewardCredits: number;
  /** 被邀请人注册奖励次数 */
  inviteeRewardCredits: number;
  /** 邀请奖励上限（每人最多可获得的奖励次数） */
  inviteRewardCap: number;
  /** 登录失败锁定阈值（次） */
  loginLockThreshold: number;
  /** 锁定时长（分钟） */
  loginLockMinutes: number;
  /** API 限速（次/分钟/IP） */
  apiRateLimitPerMin: number;
  /** AI查询限速（次/小时/用户），作为兜底上限 */
  aiQueryLimitPerHour: number;
}

const DEFAULT_CONFIG: SysConfig = {
  siteName: 'AI威科夫Pro',
  supportEmail: 'support@wyckoff.pro',
  supportWeChat: '',
  supportNote: '工作日 09:00–18:00 响应',
  subscriptionNote:
    '• 提交订单后，请耐心等待管理员审核。\n• 审核通过后订阅立即生效，到期前续费可顺延。\n• 不支持退款，如有问题请联系客服邮箱或微信。\n• 请确保转账网络与钱包一致，否则资产将永久丢失。',
  reviewTimeNote: '工作日 2 小时内审核，节假日可能延迟',
  paymentNote: '📌 请向上方对应网络地址转账对应金额 USDT\n📧 转账备注请填写您的注册邮箱\n⚠️ 请确认网络类型与钱包一致，否则资产将永久丢失',
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
