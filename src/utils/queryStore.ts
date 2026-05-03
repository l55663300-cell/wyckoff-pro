/**
 * queryStore — AI 查询记录 + 收藏币种 + 邀请统计
 * v3: 查询记录同时写 localStorage（用户端快速读）和 Supabase（管理员后台跨设备查看）
 */

import { supabase } from '../lib/supabase';

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
    if (error) console.warn('[queryStore] Supabase 写入失败，仅本地记录', error.message);
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

// ─── 收藏币种（按用户隔离） ───────────────────────────────────────────────────

function favKey(uid: string) {
  return `wyckoff_fav_${uid}`;
}

export function loadFavCoins(uid: string): string[] {
  try {
    const raw = localStorage.getItem(favKey(uid));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function saveFavCoins(uid: string, coins: string[]) {
  localStorage.setItem(favKey(uid), JSON.stringify(coins));
}

export function addFavCoin(uid: string, coin: string) {
  const coins = loadFavCoins(uid);
  if (!coins.includes(coin)) {
    coins.unshift(coin);
    saveFavCoins(uid, coins.slice(0, 20));
  }
}

export function removeFavCoin(uid: string, coin: string) {
  saveFavCoins(uid, loadFavCoins(uid).filter(c => c !== coin));
}

// ─── 邀请统计（按用户隔离） ───────────────────────────────────────────────────

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

export function saveInviteStats(uid: string, stats: InviteStats) {
  localStorage.setItem(inviteKey(uid), JSON.stringify(stats));
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
  saveInviteStats(inviterUid, stats);
}

/** 被邀请人完成首次充值后调用，给邀请人发放奖励 */
export function rewardInviter(inviterUid: string, inviteeEmail: string, rewardAmount = 10) {
  const stats = loadInviteStats(inviterUid);
  const masked = maskEmail(inviteeEmail);
  const idx = stats.records.findIndex(r => r.maskedEmail === masked && !r.hasPaid);
  if (idx >= 0) {
    stats.records[idx].hasPaid = true;
    stats.records[idx].rewardCredits = rewardAmount;
    stats.totalPaid = stats.records.filter(r => r.hasPaid).length;
    stats.totalReward = stats.records.reduce((s, r) => s + r.rewardCredits, 0);
    saveInviteStats(inviterUid, stats);
  }
}
