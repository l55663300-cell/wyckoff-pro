/**
 * queryStore — AI 查询记录 + 收藏币种 + 邀请统计
 * v4: 查询记录 localStorage + Supabase 双写；
 *     收藏币种 / 邀请统计 localStorage 缓存 + Supabase 主存，跨设备同步
 */

import { supabase } from '../lib/supabase';
import { loadSysConfig } from './sysConfigStore';

// ─── 查询记录 ─────────────────────────────────────────────────────────────────

export interface QueryRecord {
  id: string;
  uid: string;
  email: string;
  symbol: string;
  timeframe: string;
  direction: string;
  score: number;
  phase: string;
  createdAt: string;
  outcome?: 'win' | 'loss'; // 手动标记结果
}

const MAX_RECORDS = 500;

/** v2 key：按 uid 隔离 */
function queryKey(uid: string) {
  return `wyckoff_queries_${uid}`;
}

export function loadQueries(uid?: string): QueryRecord[] {
  try {
    if (!uid) {
      // 兼容旧全局 key（迁移用）
      const raw = localStorage.getItem('wyckoff_queries');
      return raw ? (JSON.parse(raw) as QueryRecord[]) : [];
    }
    const raw = localStorage.getItem(queryKey(uid));
    return raw ? (JSON.parse(raw) as QueryRecord[]) : [];
  } catch { return []; }
}

function saveQueries(uid: string, records: QueryRecord[]) {
  localStorage.setItem(queryKey(uid), JSON.stringify(records));
}

export function addQueryRecord(r: Omit<QueryRecord, 'id' | 'createdAt'>) {
  const records = loadQueries(r.uid);
  const newRecord: QueryRecord = {
    ...r,
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  records.unshift(newRecord);
  if (records.length > MAX_RECORDS) records.splice(MAX_RECORDS);
  saveQueries(r.uid, records);

  // 异步同步到 Supabase，失败不影响本地使用
  void supabase.from('query_logs').insert({
    id: newRecord.id,
    uid: newRecord.uid,
    email: newRecord.email,
    symbol: newRecord.symbol,
    timeframe: newRecord.timeframe,
    direction: newRecord.direction,
    score: newRecord.score,
    phase: newRecord.phase,
    created_at: newRecord.createdAt,
  }).then(({ error }) => {
    if (error) console.error('[queryStore] Supabase 写入失败:', error.code, error.message, error.details);
    else console.log('[queryStore] 查询记录已同步 Supabase:', newRecord.id);
  });

  return newRecord;
}

/** 从 Supabase 加载全部查询记录（管理员后台用） */
export async function loadAllQueriesFromDB(): Promise<QueryRecord[]> {
  const { data, error } = await supabase
    .from('query_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error || !data) return [];
  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    uid: row.uid as string,
    email: row.email as string,
    symbol: row.symbol as string,
    timeframe: row.timeframe as string,
    direction: row.direction as string,
    score: Number(row.score),
    phase: row.phase as string,
    createdAt: row.created_at as string,
    outcome: row.outcome as 'win' | 'loss' | undefined,
  }));
}

/** 标记某条查询的实际结果 */
export function labelQueryOutcome(uid: string, id: string, outcome: 'win' | 'loss') {
  const records = loadQueries(uid);
  const idx = records.findIndex(r => r.id === id);
  if (idx < 0) return;
  records[idx].outcome = outcome;
  saveQueries(uid, records);
}

// ─── 本周查询趋势（7天，周一→今日） ──────────────────────────────────────────

export function getWeeklyTrend(uid: string): number[] {
  const history = loadQueries(uid);
  const result = new Array(7).fill(0);
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek === 0 ? 7 : dayOfWeek) - 1));
  monday.setHours(0, 0, 0, 0);

  for (const r of history) {
    const d = new Date(r.createdAt);
    const diff = Math.floor((d.getTime() - monday.getTime()) / 86400000);
    if (diff >= 0 && diff < 7) {
      result[diff] = (result[diff] || 0) + 1;
    }
  }
  return result;
}

// ─── 准确率统计 ───────────────────────────────────────────────────────────────

export interface AccuracyStats {
  longTotal: number; longWin: number;
  shortTotal: number; shortWin: number;
  labeled: number; unlabeled: number;
  overall: number; // 0-100
}

export function calcAccuracy(uid: string): AccuracyStats {
  const history = loadQueries(uid);
  let longTotal = 0, longWin = 0, shortTotal = 0, shortWin = 0;
  let labeled = 0, unlabeled = 0;

  for (const r of history) {
    const dir = r.direction;
    const isLong = dir.includes('多') || dir === 'long';
    const isShort = dir.includes('空') || dir === 'short';
    if (isLong) {
      longTotal++;
      if (r.outcome === 'win') { longWin++; labeled++; }
      else if (r.outcome === 'loss') { labeled++; }
      else { unlabeled++; }
    } else if (isShort) {
      shortTotal++;
      if (r.outcome === 'win') { shortWin++; labeled++; }
      else if (r.outcome === 'loss') { labeled++; }
      else { unlabeled++; }
    } else {
      unlabeled++; // watch/观望 不计入
    }
  }

  const totalWin = longWin + shortWin;
  const overall = labeled > 0 ? Math.round((totalWin / labeled) * 100) : 0;
  return { longTotal, longWin, shortTotal, shortWin, labeled, unlabeled, overall };
}

// ─── 收藏币种（按用户隔离，localStorage 缓存 + Supabase 主存） ───────────────

function favKey(uid: string) {
  return `wyckoff_fav_${uid}`;
}

export function loadFavCoins(uid: string): string[] {
  try {
    const raw = localStorage.getItem(favKey(uid));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

/** 从 Supabase 加载收藏币种并同步到 localStorage */
export async function fetchFavCoins(uid: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('user_fav_coins')
      .select('coins')
      .eq('uid', uid)
      .single();
    if (!error && data?.coins) {
      const coins = data.coins as string[];
      try { localStorage.setItem(favKey(uid), JSON.stringify(coins)); } catch {}
      return coins;
    }
  } catch (e) {
    console.warn('[queryStore] fetchFavCoins 失败，降级到 localStorage:', e);
  }
  return loadFavCoins(uid);
}

function _writeFavCoins(uid: string, coins: string[]) {
  try { localStorage.setItem(favKey(uid), JSON.stringify(coins)); } catch {}
  // 异步写 Supabase
  void supabase
    .from('user_fav_coins')
    .upsert({ uid, coins, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.error('[queryStore] 收藏写 Supabase 失败:', error.message);
    });
}

export function saveFavCoins(uid: string, coins: string[]) {
  _writeFavCoins(uid, coins);
}

export function addFavCoin(uid: string, coin: string) {
  const coins = loadFavCoins(uid);
  if (!coins.includes(coin)) {
    const next = [coin, ...coins].slice(0, 20);
    _writeFavCoins(uid, next);
  }
}

export function removeFavCoin(uid: string, coin: string) {
  _writeFavCoins(uid, loadFavCoins(uid).filter(c => c !== coin));
}

// ─── 邀请统计（按用户隔离，localStorage 缓存 + Supabase 主存） ───────────────

export interface InviteRecord {
  maskedEmail: string;
  registeredAt: string; // YYYY-MM-DD
  hasPaid: boolean;
  rewardCredits: number;
}

export interface InviteStats {
  totalInvited: number;
  totalPaid: number;
  totalReward: number;
  records: InviteRecord[];
}

function inviteKey(uid: string) {
  return `wyckoff_invite_${uid}`;
}

export function loadInviteStats(uid: string): InviteStats {
  try {
    const raw = localStorage.getItem(inviteKey(uid));
    if (raw) return JSON.parse(raw) as InviteStats;
  } catch {}
  return { totalInvited: 0, totalPaid: 0, totalReward: 0, records: [] };
}

/** 从 Supabase 加载邀请统计并同步到 localStorage */
export async function fetchInviteStats(uid: string): Promise<InviteStats> {
  try {
    const { data, error } = await supabase
      .from('invite_records')
      .select('total_invited, total_paid, total_reward, records')
      .eq('uid', uid)
      .single();
    if (!error && data) {
      const stats: InviteStats = {
        totalInvited: Number(data.total_invited),
        totalPaid: Number(data.total_paid),
        totalReward: Number(data.total_reward),
        records: (data.records as InviteRecord[]) ?? [],
      };
      try { localStorage.setItem(inviteKey(uid), JSON.stringify(stats)); } catch {}
      return stats;
    }
  } catch (e) {
    console.warn('[queryStore] fetchInviteStats 失败，降级到 localStorage:', e);
  }
  return loadInviteStats(uid);
}

function _writeInviteStats(uid: string, stats: InviteStats) {
  try { localStorage.setItem(inviteKey(uid), JSON.stringify(stats)); } catch {}
  void supabase
    .from('invite_records')
    .upsert({
      uid,
      total_invited: stats.totalInvited,
      total_paid: stats.totalPaid,
      total_reward: stats.totalReward,
      records: stats.records,
      updated_at: new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.error('[queryStore] 邀请统计写 Supabase 失败:', error.message);
    });
}

export function saveInviteStats(uid: string, stats: InviteStats) {
  _writeInviteStats(uid, stats);
}

function maskEmail(email: string): string {
  const parts = email.split('@');
  const local = parts[0];
  const masked = local.length <= 2
    ? local[0] + '***'
    : local[0] + '***' + local[local.length - 1];
  return masked + '@' + (parts[1] ?? '');
}

/** 注册时被邀请人调用，给邀请人写入邀请记录 */
export function recordInvite(inviterUid: string, inviteeEmail: string) {
  const stats = loadInviteStats(inviterUid);
  stats.records.unshift({
    maskedEmail: maskEmail(inviteeEmail),
    registeredAt: new Date().toISOString().slice(0, 10),
    hasPaid: false,
    rewardCredits: 0,
  });
  stats.totalInvited = stats.records.length;
  _writeInviteStats(inviterUid, stats);
}

/** 被邀请人完成首次充值后调用，给邀请人发放奖励 */
export function rewardInviter(inviterUid: string, inviteeEmail: string, rewardAmount = 10) {
  const stats = loadInviteStats(inviterUid);
  const masked = maskEmail(inviteeEmail);
  const idx = stats.records.findIndex(r => r.maskedEmail === masked && !r.hasPaid);
  if (idx >= 0) {
    // 检查累计奖励是否已达上限
    const cfg = loadSysConfig();
    const cap = cfg.inviteRewardCap ?? 500;
    if (stats.totalReward >= cap) {
      console.warn(`[queryStore] 邀请奖励已达上限 ${cap}，跳过发放`);
      return;
    }
    // 本次发放不超过剩余上限
    const actualReward = Math.min(rewardAmount, cap - stats.totalReward);
    stats.records[idx].hasPaid = true;
    stats.records[idx].rewardCredits = actualReward;
    stats.totalPaid = stats.records.filter(r => r.hasPaid).length;
    stats.totalReward = stats.records.reduce((s, r) => s + r.rewardCredits, 0);
    _writeInviteStats(inviterUid, stats);
  }
}
