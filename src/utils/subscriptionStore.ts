/**
 * subscriptionStore — 订阅制计费核心数据层（Supabase 版）
 * 套餐 / 钱包 / 用户订阅 / 订单 全部持久化到 Supabase
 */

import { supabase } from '../lib/supabase';

// ─── 类型定义（保持与原版一致，对外接口不变） ────────────────────────────────

export type PlanCycle = 'monthly' | 'quarterly' | 'yearly';

export interface SubscriptionPlan {
  id: string;
  name: string;
  cycle: PlanCycle;
  priceUsd: number;
  durationDays: number;
  dailyLimit: number;
  hourlyLimit: number;
  isActive: boolean;
  sortOrder: number;
  popular?: boolean;
  perks: string[];
  updatedAt: string;
}

export interface PaymentWallet {
  id: string;
  label: string;
  address: string;
  network: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface UserSubscription {
  uid: string;
  planId: string;
  planName: string;
  cycle: PlanCycle;
  dailyLimit: number;
  hourlyLimit: number;
  startAt: string;
  expireAt: string;
  dailyUsed: number;
  hourlyUsed: number;
  lastUsedDate: string;
  lastUsedHour: number;
}

export type OrderStatus = 'pending' | 'confirmed' | 'rejected';

export interface SubscriptionOrder {
  id: string;
  uid: string;
  email: string;
  planId: string;
  planName: string;
  cycle: PlanCycle;
  amountUsd: number;
  walletId: string;
  walletAddress: string;
  walletNetwork: string;
  txHash?: string;
  proofNote?: string;
  status: OrderStatus;
  adminNote?: string;
  createdAt: string;
  confirmedAt?: string;
}

// ─── DB 行 → 前端对象 转换 ────────────────────────────────────────────────────

function rowToPlan(row: Record<string, unknown>): SubscriptionPlan {
  return {
    id: row.id as string,
    name: row.name as string,
    cycle: row.cycle as PlanCycle,
    priceUsd: Number(row.price_usd),
    durationDays: Number(row.duration_days),
    dailyLimit: Number(row.daily_limit),
    hourlyLimit: Number(row.hourly_limit),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order),
    popular: Boolean(row.popular),
    perks: (row.perks as string[]) ?? [],
    updatedAt: row.updated_at as string,
  };
}

function rowToWallet(row: Record<string, unknown>): PaymentWallet {
  return {
    id: row.id as string,
    label: row.label as string,
    address: row.address as string,
    network: row.network as string,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order),
    updatedAt: row.updated_at as string,
  };
}

function rowToSub(row: Record<string, unknown>): UserSubscription {
  return {
    uid: row.uid as string,
    planId: row.plan_id as string,
    planName: row.plan_name as string,
    cycle: row.cycle as PlanCycle,
    dailyLimit: Number(row.daily_limit),
    hourlyLimit: Number(row.hourly_limit),
    startAt: row.start_at as string,
    expireAt: row.expire_at as string,
    dailyUsed: Number(row.daily_used),
    hourlyUsed: Number(row.hourly_used),
    lastUsedDate: (row.last_used_date as string) ?? '',
    lastUsedHour: Number(row.last_used_hour ?? -1),
  };
}

function rowToOrder(row: Record<string, unknown>): SubscriptionOrder {
  return {
    id: row.id as string,
    uid: row.uid as string,
    email: row.email as string,
    planId: row.plan_id as string,
    planName: row.plan_name as string,
    cycle: row.cycle as PlanCycle,
    amountUsd: Number(row.amount_usd),
    walletId: row.wallet_id as string,
    walletAddress: row.wallet_address as string,
    walletNetwork: row.wallet_network as string,
    txHash: row.tx_hash as string | undefined,
    proofNote: row.proof_note as string | undefined,
    status: row.status as OrderStatus,
    adminNote: row.admin_note as string | undefined,
    createdAt: row.created_at as string,
    confirmedAt: row.confirmed_at as string | undefined,
  };
}

// ─── 套餐 ─────────────────────────────────────────────────────────────────────

export async function loadPlans(): Promise<SubscriptionPlan[]> {
  const { data } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('sort_order');
  return (data ?? []).map(rowToPlan);
}

export async function getActivePlans(): Promise<SubscriptionPlan[]> {
  const { data } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []).map(rowToPlan);
}

export async function updatePlan(id: string, patch: Partial<SubscriptionPlan>): Promise<SubscriptionPlan | null> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.priceUsd !== undefined) dbPatch.price_usd = patch.priceUsd;
  if (patch.durationDays !== undefined) dbPatch.duration_days = patch.durationDays;
  if (patch.dailyLimit !== undefined) dbPatch.daily_limit = patch.dailyLimit;
  if (patch.hourlyLimit !== undefined) dbPatch.hourly_limit = patch.hourlyLimit;
  if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;
  if (patch.sortOrder !== undefined) dbPatch.sort_order = patch.sortOrder;
  if (patch.popular !== undefined) dbPatch.popular = patch.popular;
  dbPatch.updated_at = new Date().toISOString();

  const { data } = await supabase
    .from('subscription_plans')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .single();
  return data ? rowToPlan(data) : null;
}

// ─── 钱包 ─────────────────────────────────────────────────────────────────────

export async function loadWallets(): Promise<PaymentWallet[]> {
  const { data } = await supabase
    .from('payment_wallets')
    .select('*')
    .order('sort_order');
  return (data ?? []).map(rowToWallet);
}

export async function getActiveWallets(): Promise<PaymentWallet[]> {
  const { data } = await supabase
    .from('payment_wallets')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []).map(rowToWallet);
}

export async function upsertWallet(wallet: PaymentWallet): Promise<void> {
  await supabase.from('payment_wallets').upsert({
    id: wallet.id,
    label: wallet.label,
    address: wallet.address,
    network: wallet.network,
    is_active: wallet.isActive,
    sort_order: wallet.sortOrder,
    updated_at: new Date().toISOString(),
  });
}

export async function deleteWallet(id: string): Promise<void> {
  await supabase.from('payment_wallets').delete().eq('id', id);
}

// ─── 用户订阅状态 ──────────────────────────────────────────────────────────────

export async function getUserSubscription(uid: string): Promise<UserSubscription | null> {
  const { data } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('uid', uid)
    .single();
  return data ? rowToSub(data) : null;
}

export async function setUserSubscription(sub: UserSubscription): Promise<void> {
  await supabase.from('user_subscriptions').upsert({
    uid: sub.uid,
    plan_id: sub.planId,
    plan_name: sub.planName,
    cycle: sub.cycle,
    daily_limit: sub.dailyLimit,
    hourly_limit: sub.hourlyLimit,
    start_at: sub.startAt,
    expire_at: sub.expireAt,
    daily_used: sub.dailyUsed,
    hourly_used: sub.hourlyUsed,
    last_used_date: sub.lastUsedDate,
    last_used_hour: sub.lastUsedHour,
    updated_at: new Date().toISOString(),
  });
}

export async function activateSubscription(uid: string, plan: SubscriptionPlan): Promise<UserSubscription> {
  const existing = await getUserSubscription(uid);

  const base = existing && new Date(existing.expireAt) > new Date()
    ? new Date(existing.expireAt)
    : new Date();
  const expireAt = new Date(base.getTime() + plan.durationDays * 86400 * 1000);

  const dailyLimit  = existing ? Math.max(existing.dailyLimit,  plan.dailyLimit)  : plan.dailyLimit;
  const hourlyLimit = existing ? Math.max(existing.hourlyLimit, plan.hourlyLimit) : plan.hourlyLimit;

  const sub: UserSubscription = {
    uid,
    planId: plan.id,
    planName: plan.name,
    cycle: plan.cycle,
    dailyLimit,
    hourlyLimit,
    startAt: new Date().toISOString(),
    expireAt: expireAt.toISOString(),
    dailyUsed:    existing?.dailyUsed    ?? 0,
    hourlyUsed:   existing?.hourlyUsed   ?? 0,
    lastUsedDate: existing?.lastUsedDate ?? '',
    lastUsedHour: existing?.lastUsedHour ?? -1,
  };
  await setUserSubscription(sub);
  return sub;
}

// ─── 用量限流（AI 查询前调用，纯内存+同步，避免每次都等网络） ────────────────

// 本地缓存订阅信息，减少 Supabase 请求
let _subCache: UserSubscription | null = null;
let _subCacheUid = '';

export async function loadSubCache(uid: string): Promise<void> {
  // 每次都从数据库读取最新值，确保 dailyUsed 计数强一致
  _subCache = await getUserSubscription(uid);
  _subCacheUid = uid;
}

export type QuotaCheckResult =
  | { allowed: true; remaining: { daily: number; hourly: number } }
  | { allowed: false; reason: string };

/** 同步版（需先调 loadSubCache 预热缓存） */
export function checkAndConsumeQuotaSync(uid: string): QuotaCheckResult {
  const sub = _subCacheUid === uid ? _subCache : null;
  if (!sub) return { allowed: false, reason: '未开通订阅，请先订阅套餐' };
  if (new Date(sub.expireAt) <= new Date()) return { allowed: false, reason: '订阅已到期，请续费后继续使用' };

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hour = now.getHours();

  if (sub.lastUsedDate !== today) { sub.dailyUsed = 0; sub.lastUsedDate = today; }
  if (sub.lastUsedHour !== hour) { sub.hourlyUsed = 0; sub.lastUsedHour = hour; }

  if (sub.dailyUsed >= sub.dailyLimit) {
    void setUserSubscription(sub);
    return { allowed: false, reason: `今日 ${sub.dailyLimit} 次配额已用完，明日 00:00 自动重置` };
  }
  if (sub.hourlyUsed >= sub.hourlyLimit) {
    void setUserSubscription(sub);
    const minsLeft = 60 - now.getMinutes();
    return { allowed: false, reason: `本小时请求较频繁，约 ${minsLeft} 分钟后恢复` };
  }

  sub.dailyUsed += 1;
  sub.hourlyUsed += 1;
  void setUserSubscription(sub); // 异步写库，不阻塞用户
  return { allowed: true, remaining: { daily: sub.dailyLimit - sub.dailyUsed, hourly: sub.hourlyLimit - sub.hourlyUsed } };
}

/** 异步版（直接从数据库读取，适合需要强一致性的场景） */
export async function checkAndConsumeQuota(uid: string): Promise<QuotaCheckResult> {
  await loadSubCache(uid);
  return checkAndConsumeQuotaSync(uid);
}

/** 查询剩余配额（不消耗，展示用） */
export async function getRemainingQuota(uid: string): Promise<{ daily: number; total: number; expireAt: string | null; isActive: boolean }> {
  const sub = await getUserSubscription(uid);
  if (!sub) return { daily: 0, total: 0, expireAt: null, isActive: false };
  const active = new Date(sub.expireAt) > new Date();
  if (!active) return { daily: 0, total: sub.dailyLimit, expireAt: sub.expireAt, isActive: false };
  const today = new Date().toISOString().slice(0, 10);
  const dailyUsed = sub.lastUsedDate === today ? sub.dailyUsed : 0;
  return { daily: Math.max(0, sub.dailyLimit - dailyUsed), total: sub.dailyLimit, expireAt: sub.expireAt, isActive: true };
}

// ─── 订单 CRUD ────────────────────────────────────────────────────────────────

export async function loadSubOrders(): Promise<SubscriptionOrder[]> {
  const { data } = await supabase
    .from('subscription_orders')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []).map(rowToOrder);
}

export async function submitSubOrder(
  user: { uid: string; email: string },
  plan: SubscriptionPlan,
  wallet: PaymentWallet,
  txHash?: string,
  proofNote?: string,
): Promise<SubscriptionOrder> {
  const order = {
    id: `SO${Date.now()}`,
    uid: user.uid,
    email: user.email,
    plan_id: plan.id,
    plan_name: `${plan.name}（${CYCLE_LABEL[plan.cycle]}）`,
    cycle: plan.cycle,
    amount_usd: plan.priceUsd,
    wallet_id: wallet.id,
    wallet_address: wallet.address,
    wallet_network: wallet.network,
    tx_hash: txHash ?? null,
    proof_note: proofNote ?? null,
    status: 'pending' as const,
    created_at: new Date().toISOString(),
  };
  const { data } = await supabase
    .from('subscription_orders')
    .insert(order)
    .select()
    .single();
  return rowToOrder(data!);
}

export async function confirmSubOrder(orderId: string, adminNote?: string): Promise<SubscriptionOrder | null> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('subscription_orders')
    .update({ status: 'confirmed', confirmed_at: now, admin_note: adminNote ?? null })
    .eq('id', orderId)
    .select()
    .single();
  if (!data) return null;

  const order = rowToOrder(data);
  // 开通订阅
  const plans = await loadPlans();
  const plan = plans.find(p => p.id === order.planId);
  if (plan) await activateSubscription(order.uid, plan);
  return order;
}

export async function rejectSubOrder(orderId: string, adminNote?: string): Promise<SubscriptionOrder | null> {
  const { data } = await supabase
    .from('subscription_orders')
    .update({ status: 'rejected', confirmed_at: new Date().toISOString(), admin_note: adminNote ?? null })
    .eq('id', orderId)
    .select()
    .single();
  return data ? rowToOrder(data) : null;
}

export async function getPendingSubOrders(): Promise<SubscriptionOrder[]> {
  const { data } = await supabase
    .from('subscription_orders')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return (data ?? []).map(rowToOrder);
}

export async function getUserSubOrders(uid: string): Promise<SubscriptionOrder[]> {
  const { data } = await supabase
    .from('subscription_orders')
    .select('*')
    .eq('uid', uid)
    .order('created_at', { ascending: false });
  return (data ?? []).map(rowToOrder);
}

// ─── 免费试用套餐（动态读取后台配置） ──────────────────────────────────────────

import { loadSysConfig } from './sysConfigStore';

export function getFreeTrialPlan(): SubscriptionPlan {
  const cfg = loadSysConfig();
  const days = cfg.freeTrialDays ?? 7;
  const limit = cfg.freeTrialDailyLimit ?? 5;
  return {
    id: 'free_trial',
    name: '免费试用',
    cycle: 'monthly',
    priceUsd: 0,
    durationDays: days,
    dailyLimit: limit,
    hourlyLimit: limit,
    isActive: false,
    sortOrder: 0,
    perks: ['注册赠送', `每日${limit}次`, `有效期${days}天`],
    updatedAt: new Date().toISOString(),
  };
}

/** @deprecated 使用 getFreeTrialPlan() 代替，保留此常量仅供类型引用 */
export const FREE_TRIAL_PLAN: SubscriptionPlan = getFreeTrialPlan();

// ─── 常量 ──────────────────────────────────────────────────────────────────────

export const CYCLE_LABEL: Record<PlanCycle, string> = {
  monthly:   '月付',
  quarterly: '季付',
  yearly:    '年付',
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending:   '待审核',
  confirmed: '已确认',
  rejected:  '已拒绝',
};
