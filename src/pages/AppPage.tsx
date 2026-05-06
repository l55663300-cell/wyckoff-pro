import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RefreshCw, Bell, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { Symbol, Timeframe, DEFAULT_SYMBOLS } from '../types';
import { useAnalysis, REANALYZE_COOLDOWN_MS } from '../hooks/useAnalysis';
import { fetchKlines } from '../api/binanceApi';
import { KLine } from '../types';
import { TIMEFRAME_RISK_CONFIG } from '../calc/riskControl';
import { CandlestickChart } from '../components/chart/CandlestickChart';
import { VolumeProfileBar } from '../components/chart/VolumeProfileBar';
import { OrderBookHeatmap } from '../components/chart/OrderBookHeatmap';
import { IndicatorPanel } from '../components/indicators/IndicatorPanel';
import { ReportPanel } from '../components/report/ReportPanel';
import { TrendingPanel } from '../components/news/TrendingPanel';
import { WechatAlertModal } from '../components/WechatAlertModal';
import { WechatPushConfig, loadPushConfig, sendWechatPush, buildEntryAlertMessage } from '../utils/wechatPush';
import { formatPrice, formatPercent } from '../utils/formatters';
import { useApp } from '../context/AppContext';
import { CreditsModal } from '../components/modals/CreditsModal';
import { NotifPanel } from '../components/modals/NotifPanel';
import { AvatarDropdown } from '../components/modals/AvatarDropdown';
import { addQueryRecord } from '../utils/queryStore';
import { addFavCoin, removeFavCoin, loadFavCoins } from '../utils/queryStore';
import { loadContent } from '../utils/contentStore';
import { useToast } from '../components/Toast';
import { useT, toggleLang } from '../i18n';

const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000;


const TF_LIST: { key: Timeframe; label: string }[] = [
  { key: '15m', label: '15m' },
  { key: '1h', label: '1H' },
  { key: '4h', label: '4H' },
  { key: '1d', label: '1D' },
];

const SYMBOL_META: Record<string, { icon: string; name: string }> = {
  ETHUSDT:  { icon: '💎', name: 'ETH' },
  BTCUSDT:  { icon: '₿',  name: 'BTC' },
  XAUTUSDT: { icon: '🥇', name: 'XAUT' },
  SOLUSDT:  { icon: '☀️', name: 'SOL' },
  BNBUSDT:  { icon: '🟡', name: 'BNB' },
  XRPUSDT:  { icon: '💧', name: 'XRP' },
  DOGEUSDT: { icon: '🐕', name: 'DOGE' },
};
function getSymbolMeta(sym: string) {
  return SYMBOL_META[sym] ?? { icon: '🪙', name: sym.replace('USDT', '') };
}

const LS_KEY = 'wyckoff_watchlist_v3';
function loadWatchlist(): string[] {
  try { const r = localStorage.getItem(LS_KEY); if (r) return JSON.parse(r); } catch {}
  return [...DEFAULT_SYMBOLS];
}
function saveWatchlist(list: string[]) { localStorage.setItem(LS_KEY, JSON.stringify(list)); }

// 上次查询参数持久化（刷新后自动恢复）
const LS_LAST_QUERY_KEY = 'wyckoff_last_query_v1';
interface LastQuery { symbol: Symbol; timeframe: Timeframe; }
function loadLastQuery(): LastQuery | null {
  try { const r = localStorage.getItem(LS_LAST_QUERY_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveLastQuery(symbol: Symbol, timeframe: Timeframe) {
  localStorage.setItem(LS_LAST_QUERY_KEY, JSON.stringify({ symbol, timeframe }));
}

// 分析结果持久化（刷新后直接渲染，不重新扣积分）
// aiReport 体积大，单独存一个 key，避免超出 localStorage 单条大小限制
const LS_RESULT_KEY = 'wyckoff_last_result_v1';
const LS_AI_REPORT_KEY = 'wyckoff_last_ai_report_v1';

function loadLastResult(): import('../types').AnalysisResult | null {
  try {
    const r = localStorage.getItem(LS_RESULT_KEY);
    if (!r) return null;
    const parsed = JSON.parse(r);
    if (!parsed || typeof parsed !== 'object' || !parsed.symbol || !parsed.scoring) return null;
    // 合并单独存储的 aiReport
    try {
      const aiRaw = localStorage.getItem(LS_AI_REPORT_KEY);
      if (aiRaw) parsed.aiReport = JSON.parse(aiRaw);
    } catch {}
    return parsed;
  } catch { return null; }
}

function saveLastResult(result: import('../types').AnalysisResult) {
  try {
    // 把 aiReport 分离出来单独存，避免主 JSON 过大
    const { aiReport, ...rest } = result as import('../types').AnalysisResult & { aiReport?: unknown };
    localStorage.setItem(LS_RESULT_KEY, JSON.stringify(rest));
    if (aiReport !== undefined) {
      try { localStorage.setItem(LS_AI_REPORT_KEY, JSON.stringify(aiReport)); } catch {}
    }
  } catch {}
}

/**
 * 根据分析周期判断结果的时效阈值（毫秒）
 * fresh: 数据新鲜，正常展示
 * stale: 轻微过期，提示建议刷新
 * expired: 严重过期，提示数据已过期
 */
const FRESHNESS_THRESHOLDS: Record<import('../types').Timeframe, { fresh: number; stale: number }> = {
  '15m': { fresh: 30 * 60 * 1000,      stale: 60 * 60 * 1000 },        // 30min / 1h
  '1h':  { fresh: 2 * 60 * 60 * 1000,  stale: 4 * 60 * 60 * 1000 },    // 2h / 4h
  '4h':  { fresh: 8 * 60 * 60 * 1000,  stale: 16 * 60 * 60 * 1000 },   // 8h / 16h
  '1d':  { fresh: 36 * 60 * 60 * 1000, stale: 72 * 60 * 60 * 1000 },   // 36h / 72h
};

type FreshnessStatus = 'fresh' | 'stale' | 'expired';

function getResultFreshness(timestamp: number, timeframe: import('../types').Timeframe): FreshnessStatus {
  const age = Date.now() - timestamp;
  const { fresh, stale } = FRESHNESS_THRESHOLDS[timeframe] ?? FRESHNESS_THRESHOLDS['1h'];
  if (age <= fresh) return 'fresh';
  if (age <= stale) return 'stale';
  return 'expired';
}

type RightPanelTab = 'ai' | 'wyckoff' | 'news';

export default function AppPage() {
  const { user, navigate, consumeQuota, getQuota } = useApp();
  const { showToast } = useToast();
  const t = useT();

  const [symbol, setSymbol] = useState<Symbol>(() => loadLastQuery()?.symbol ?? 'BTCUSDT');
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>(() => loadLastQuery()?.timeframe ?? '1h');
  const [chartKlines, setChartKlines] = useState<KLine[]>([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [pushConfig, setPushConfig] = useState<WechatPushConfig>(loadPushConfig);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist);
  const [symSearch, setSymSearch] = useState('');
  const [symInputErr, setSymInputErr] = useState('');
  const { result, loading, error, analyze, reset, getCached, invalidateCache } = useAnalysis();

  // error 变化时通过全局 Toast 展示错误信息
  useEffect(() => {
    if (error) showToast(error, 'error', 6000);
  }, [error]);
  // displayResult 用于展示；初始化时尝试从 localStorage 恢复上次结果
  const [displayResult, setDisplayResult] = useState<typeof result>(() => loadLastResult());
  // 缓存命中时是否已过期（用于显示"数据较旧"提示）
  const [cacheExpired, setCacheExpired] = useState(false);
  // 恢复数据的时效状态：fresh=新鲜 / stale=轻微过期 / expired=严重过期
  const [freshnessStatus, setFreshnessStatus] = useState<FreshnessStatus>(() => {
    const saved = loadLastResult();
    if (!saved?.timestamp) return 'fresh';
    const tf = loadLastQuery()?.timeframe ?? '1h';
    return getResultFreshness(saved.timestamp, tf);
  });
  // 重新分析冷却（防止频繁点击，3分钟）
  const [reanalyzeCooldown, setReanalyzeCooldown] = useState(0);
  const reanalyzeCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // result 更新时同步到 displayResult，并持久化到 localStorage（刷新后直接渲染）
  useEffect(() => {
    if (result) {
      setDisplayResult(result);
      setCacheExpired(false);
      setFreshnessStatus('fresh');
      saveLastResult(result);
    }
  }, [result]);

  const autoRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // 记录上次已消耗积分分析过的币种，同币种不重复扣分
  const analyzedSymbolRef = useRef<string | null>(null);
  // 记录每个 key 最近一次真实分析时间，用于冷却判断
  const lastAnalyzeTimeRef = useRef<Map<string, number>>(new Map());


  const [rightTab, setRightTab] = useState<RightPanelTab>('ai');
  const [quotaInfo, setQuotaInfo] = useState<{ daily: number; total: number; expireAt: string | null; isActive: boolean }>({ daily: 0, total: 0, expireAt: null, isActive: false });
  const [bannerVisible, setBannerVisible] = useState(true);
  const content = loadContent();
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [quotaBlockReason, setQuotaBlockReason] = useState('');
  const [showNotif, setShowNotif] = useState(false);
  const [showAvatarDd, setShowAvatarDd] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'complaint' | 'other'>('bug');
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [unreadNotif, setUnreadNotif] = useState(0);
  useEffect(() => {
    void (async () => {
      const { getUnreadCountAsync } = await import('../utils/noticeStore');
      setUnreadNotif(await getUnreadCountAsync());
    })();
  }, []);
  // 指标栏折叠（小屏时可隐藏）
  const [indicatorExpanded, setIndicatorExpanded] = useState(true);
  // 收藏币种
  const [favCoins, setFavCoins] = useState<string[]>(() => user ? loadFavCoins(user.uid) : []);
  // 是否显示搜索候选下拉
  const [showSymSuggestions, setShowSymSuggestions] = useState(false);
  // 新手引导蒙版（第一次登录后触发）
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem('wyckoff_onboarding_done_v1'); } catch { return false; }
  });

  // 新闻独立30分钟刷新

  // 同步 quotaInfo state（getQuota 是 async，不能在 JSX 里直接调用）
  useEffect(() => {
    getQuota().then(setQuotaInfo);
  }, [user, getQuota]);

  // 刷新后自动恢复：直接展示上次结果（已从 localStorage 初始化 displayResult）
  // user 从 AppContext 恢复是异步的，必须监听 user 变化，等 user 有值后再执行恢复逻辑
  const hasAutoRestored = useRef(false);
  useEffect(() => {
    if (!user || hasAutoRestored.current) return;
    hasAutoRestored.current = true;
    const last = loadLastQuery();
    const savedResult = loadLastResult();
    if (!last || !savedResult) return;
    // 恢复 displayResult（useState 初始化时已读取，这里补算时效状态）
    if (savedResult.timestamp) {
      setFreshnessStatus(getResultFreshness(savedResult.timestamp, last.timeframe));
    }
    // 标记已分析过该币种，切换同币种不重复扣分
    analyzedSymbolRef.current = last.symbol;
  }, [user]);

  /** 启动重新分析冷却倒计时 */
  const startReanalyzeCooldown = useCallback(() => {
    const secs = Math.ceil(REANALYZE_COOLDOWN_MS / 1000);
    setReanalyzeCooldown(secs);
    if (reanalyzeCooldownRef.current) clearInterval(reanalyzeCooldownRef.current);
    reanalyzeCooldownRef.current = setInterval(() => {
      setReanalyzeCooldown(prev => {
        if (prev <= 1) {
          if (reanalyzeCooldownRef.current) clearInterval(reanalyzeCooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleAnalyze = useCallback(async (sym?: Symbol, tf?: Timeframe, forceReanalyze = false) => {
    if (!user) return;
    const targetSym = sym ?? symbol;
    const targetTf = tf ?? activeTimeframe;
    const cacheKey = `${targetSym}_${targetTf}`;

    // 如果不是强制重新分析，先查缓存
    if (!forceReanalyze) {
      const cached = getCached(targetSym, targetTf);
      if (cached) {
        setDisplayResult(cached.result);
        setCacheExpired(cached.isExpired);
        // 如果缓存已过期，自动触发后台静默更新（不扣积分，仅换币种才扣）
        if (!cached.isExpired) return;
        // 已过期：继续往下走，触发重新分析
      }
    }

    // 检查冷却（强制重新分析也受冷却保护）
    const lastTime = lastAnalyzeTimeRef.current.get(cacheKey) ?? 0;
    const elapsed = Date.now() - lastTime;
    if (elapsed < REANALYZE_COOLDOWN_MS && lastTime > 0) {
      const remaining = Math.ceil((REANALYZE_COOLDOWN_MS - elapsed) / 1000);
      setReanalyzeCooldown(remaining);
      if (reanalyzeCooldownRef.current) clearInterval(reanalyzeCooldownRef.current);
      reanalyzeCooldownRef.current = setInterval(() => {
        setReanalyzeCooldown(prev => {
          if (prev <= 1) {
            if (reanalyzeCooldownRef.current) clearInterval(reanalyzeCooldownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return;
    }

    // 订阅配额检查（换新币种才消耗次数，切周期复用缓存不消耗）
    const needConsume = analyzedSymbolRef.current !== targetSym;
    if (needConsume) {
      const quota = await consumeQuota();
      if (!quota.allowed) {
        setQuotaBlockReason(quota.reason);
        setShowCreditsModal(true);
        return;
      }
      analyzedSymbolRef.current = targetSym;
      getQuota().then(setQuotaInfo);
    }
    analyze(targetSym, targetTf);
    saveLastQuery(targetSym, targetTf);
    lastAnalyzeTimeRef.current.set(cacheKey, Date.now());
    startReanalyzeCooldown();
  }, [analyze, symbol, activeTimeframe, user, consumeQuota, getCached, startReanalyzeCooldown]);

  /** 强制重新分析（手动点"重新分析"按钮） */
  const handleForceReanalyze = useCallback(() => {
    if (reanalyzeCooldown > 0 || loading) return;
    invalidateCache(symbol, activeTimeframe);
    handleAnalyze(symbol, activeTimeframe, true);
  }, [reanalyzeCooldown, loading, invalidateCache, symbol, activeTimeframe, handleAnalyze]);

  // 分析完成后写查询记录
  useEffect(() => {
    if (!result || !user) return;
    const dir = result.scoring.direction === 'long' ? '▲ 做多' : result.scoring.direction === 'short' ? '▼ 做空' : '◆ 观望';
    addQueryRecord({
      uid: user.uid,
      email: user.email,
      symbol: result.symbol,
      timeframe: result.activeTimeframe,
      direction: dir,
      score: result.scoring.score,
      phase: result.wyckoff.phase,
    });
  }, [result]);

  const handleTimeframeChange = useCallback((tf: Timeframe) => {
    setActiveTimeframe(tf);
    // 查缓存：有历史分析直接还原（无论是否过期都展示）
    const cached = getCached(symbol, tf);
    if (cached) {
      setDisplayResult(cached.result);
      setCacheExpired(cached.isExpired);
    } else {
      setDisplayResult(null);
      setCacheExpired(false);
    }
    // 重置冷却（切换周期不受限制）
    setReanalyzeCooldown(0);
    if (reanalyzeCooldownRef.current) clearInterval(reanalyzeCooldownRef.current);
  }, [getCached, symbol]);

  const handleSymbolChange = useCallback((s: Symbol) => {
    setSymbol(s);
    // 切换币种：查新币种缓存
    const cached = getCached(s, activeTimeframe);
    if (cached) {
      setDisplayResult(cached.result);
      setCacheExpired(cached.isExpired);
    } else {
      setDisplayResult(null);
      setCacheExpired(false);
    }
    // 切换币种需要重新扣分（但不清缓存，保留所有历史）
    analyzedSymbolRef.current = null;
    setReanalyzeCooldown(0);
    if (reanalyzeCooldownRef.current) clearInterval(reanalyzeCooldownRef.current);
  }, [getCached, activeTimeframe]);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshTimer.current = setInterval(() => analyze(symbol, activeTimeframe), AUTO_REFRESH_INTERVAL);
    } else {
      if (autoRefreshTimer.current) { clearInterval(autoRefreshTimer.current); autoRefreshTimer.current = null; }
    }
    return () => { if (autoRefreshTimer.current) clearInterval(autoRefreshTimer.current); };
  }, [autoRefresh, symbol, activeTimeframe]);

  // 微信推送 + 邮件信号推送
  useEffect(() => {
    if (!result || !user) return;
    const dir = result.scoring.direction;
    if (dir === 'neutral') return;
    if (result.scoring.probability < pushConfig.minProbability) return;

    // 微信推送
    if (pushConfig.enabled && pushConfig.sendKey) {
      const { title, body } = buildEntryAlertMessage(
        result.symbol, result.price, dir as 'long' | 'short',
        result.scoring.probability, result.wyckoff.phase, result.wyckoff.pattern,
        result.risk.entryLow, result.risk.entryHigh, result.risk.stopLoss,
        result.risk.target1, result.risk.target2, result.risk.target3,
        result.risk.riskReward, result.risk.positionSize,
        result.wyckoff.compositeManBehavior,
        result.sentiment.fearGreed, result.sentiment.fearGreedLabel,
      );
      sendWechatPush(pushConfig, title, body).then((res) => {
        setPushStatus(res.ok ? '✅ 微信推送已发送' : `⚠️ 推送失败: ${res.msg}`);
        setTimeout(() => setPushStatus(null), 5000);
      });
    }

    // 邮件信号推送（有登录邮箱时自动发送）
    if (user.email) {
      fetch('/api/email/signal-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.email,
          symbol: result.symbol,
          timeframe: result.activeTimeframe,
          direction: dir as 'long' | 'short',
          score: result.scoring.score,
          probability: result.scoring.probability,
          phase: result.wyckoff.phase,
          price: result.price,
          entryLow: result.risk.entryLow,
          entryHigh: result.risk.entryHigh,
          stopLoss: result.risk.stopLoss,
          target1: result.risk.target1,
          riskReward: result.risk.riskReward,
        }),
      }).then(r => {
        if (r.ok) {
          setPushStatus(prev => prev ? prev + ' · ✉️ 邮件已发送' : '✉️ 信号邮件已发送');
          setTimeout(() => setPushStatus(null), 5000);
        }
      }).catch(() => {});
    }
  }, [result]);

  // K线（1000条）
  useEffect(() => {
    let cancelled = false;
    fetchKlines(symbol, activeTimeframe, 1000).then(klines => {
      if (!cancelled) setChartKlines(klines);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [symbol, activeTimeframe]);

  // 添加自选
  const handleAddSym = useCallback(() => {
    const sym = symSearch.trim().toUpperCase();
    if (!sym) return;
    if (/[\u4e00-\u9fa5]/.test(sym)) { setSymInputErr('不支持中文'); return; }
    const full = sym.endsWith('USDT') ? sym : sym + 'USDT';
    if (watchlist.includes(full)) { setSymInputErr('已在列表'); return; }
    const next = [...watchlist, full];
    setWatchlist(next); saveWatchlist(next);
    setSymSearch(''); setSymInputErr('');
    handleSymbolChange(full);
  }, [symSearch, watchlist, handleSymbolChange]);

  const handleRemoveSym = useCallback((sym: string) => {
    if (DEFAULT_SYMBOLS.includes(sym as any)) return;
    const next = watchlist.filter(s => s !== sym);
    setWatchlist(next); saveWatchlist(next);
    if (symbol === sym && next.length) handleSymbolChange(next[0]);
  }, [watchlist, symbol, handleSymbolChange]);

  const price = displayResult?.price ?? 0;
  const priceChange = displayResult?.priceChange24h ?? 0;
  const isPos = priceChange >= 0;
  const tfConf = TIMEFRAME_RISK_CONFIG[activeTimeframe];
  const symMeta = getSymbolMeta(symbol);
  const displaySymbol = symbol.replace('USDT', '/USDT');

  const filteredWatchlist = watchlist.filter(s =>
    !symSearch || s.toLowerCase().includes(symSearch.toLowerCase())
  );

  // 缓存时间显示
  const cacheTimeLabel = displayResult
    ? new Date(displayResult.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : null;

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // 手机端底部 tab
  type MobileTab = 'chart' | 'report' | 'wyckoff' | 'news';
  const [mobileTab, setMobileTab] = useState<MobileTab>('chart');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#notifPanel') && !target.closest('#notifBtn')) setShowNotif(false);
      if (!target.closest('#avatarDd') && !target.closest('#avatarBtn')) setShowAvatarDd(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg1)', overflow: 'hidden' }}>

      {/* ── 活动Banner（从 contentStore 读取，与首页同步） ── */}
      {bannerVisible && content.banner.enabled && (
        <div className="activity-banner">
          {content.banner.text}
          {content.banner.linkText && (
            <a onClick={() => navigate('recharge')} style={{ cursor: 'pointer' }}>{content.banner.linkText} →</a>
          )}
          <button className="activity-banner-close" onClick={() => setBannerVisible(false)}>×</button>
        </div>
      )}

      {/* ── App Layout ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── 左侧边栏（大屏显示，手机隐藏） ── */}
        {!isMobile && (
        <div style={{
          width: 200, flexShrink: 0,
          background: 'var(--bg2)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* 侧边栏头部 */}
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: 'var(--primary)', cursor: 'pointer' }}
              onClick={() => navigate(user ? 'app' : 'landing')}
              title="返回首页"
            >
              🦞 AI威科夫Pro
            </div>
          </div>

          {/* 搜索 */}
          <div style={{ padding: '8px 10px', position: 'relative' }}>
            <input
              value={symSearch}
              onChange={e => { setSymSearch(e.target.value); setSymInputErr(''); setShowSymSuggestions(true); }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleAddSym();
                  setShowSymSuggestions(false);
                }
                if (e.key === 'Escape') { setShowSymSuggestions(false); setSymSearch(''); }
              }}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--primary)'; if (symSearch) setShowSymSuggestions(true); }}
              onBlur={e => {
                (e.target as HTMLInputElement).style.borderColor = 'var(--border)';
                setTimeout(() => setShowSymSuggestions(false), 150);
              }}
              placeholder="搜索或输入币种代码..."
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 8, boxSizing: 'border-box',
                background: 'var(--bg3)', border: '1px solid var(--border)',
                color: 'var(--t1)', fontSize: 12, outline: 'none', fontFamily: 'inherit',
              }}
            />
            {/* 搜索候选下拉（输入时显示匹配的币种，含+按钮直接添加） */}
            {showSymSuggestions && symSearch.trim().length >= 1 && (() => {
              const raw = symSearch.trim().toUpperCase();
              const full = raw.endsWith('USDT') ? raw : raw + 'USDT';
              const alreadyIn = watchlist.includes(full);
              const isValidFormat = /^[A-Z0-9]+USDT$/.test(full) && full.length >= 6;
              const hasChinese = /[\u4e00-\u9fa5]/.test(raw);
              return (
                <div style={{
                  position: 'absolute', top: '100%', left: 10, right: 10, zIndex: 200,
                  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)', overflow: 'hidden',
                }}>
                  {hasChinese ? (
                    <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--red)' }}>⚠ 不支持中文，请输入如 BTCUSDT 或 BTC</div>
                  ) : alreadyIn ? (
                    <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--t3)' }}>"{full}" 已在列表中</div>
                  ) : !isValidFormat ? (
                    <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--t3)' }}>请输入正确格式，如 BTC 或 BTCUSDT</div>
                  ) : (
                    <div
                      onClick={() => { handleAddSym(); setShowSymSuggestions(false); }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{full}</span>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, background: 'var(--primary)', color: '#000',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0,
                      }}>+</span>
                    </div>
                  )}
                </div>
              );
            })()}
            {symInputErr && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{symInputErr}</div>}
          </div>

          {/* 币种列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
            <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', padding: '4px 8px' }}>自选列表</div>
            {filteredWatchlist.map(sym => {
              const meta = getSymbolMeta(sym);
              const isActive = sym === symbol;
              const isDefault = DEFAULT_SYMBOLS.includes(sym as any);
              // 是否有缓存
              const hasCached = !!getCached(sym, activeTimeframe);
              const isFav = user ? favCoins.includes(sym) : false;
              return (
                <div
                  key={sym}
                  onClick={() => handleSymbolChange(sym)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 8px', borderRadius: 8, cursor: 'pointer',
                    marginBottom: 2, transition: 'background .1s',
                    background: isActive ? 'rgba(240,180,41,0.1)' : 'transparent',
                    border: isActive ? '1px solid rgba(240,180,41,0.2)' : '1px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg3)'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{meta.name}/USDT</span>
                      {/* 缓存指示点 */}
                      {hasCached && !isActive && (
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} title="有缓存" />
                      )}
                    </div>
                    {isActive && price > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--t2)' }}>${formatPrice(price, sym)}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    {isActive && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: isPos ? 'var(--green)' : 'var(--red)' }}>
                        {isPos ? '+' : ''}{formatPercent(priceChange)}
                      </span>
                    )}
                    {/* ★ 收藏按钮 */}
                    {user && (
                      <span
                        onClick={e => {
                          e.stopPropagation();
                          if (isFav) {
                            removeFavCoin(user.uid, sym);
                          } else {
                            addFavCoin(user.uid, sym);
                          }
                          setFavCoins(loadFavCoins(user.uid));
                        }}
                        title={isFav ? '取消收藏' : '收藏'}
                        style={{ fontSize: 12, color: isFav ? '#f0b429' : 'var(--t4)', cursor: 'pointer', padding: '0 1px', lineHeight: 1, transition: 'color .15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#f0b429')}
                        onMouseLeave={e => (e.currentTarget.style.color = isFav ? '#f0b429' : 'var(--t4)')}
                      >★</span>
                    )}
                    {!isDefault && (
                      <span
                        onClick={e => { e.stopPropagation(); handleRemoveSym(sym); }}
                        style={{ fontSize: 12, color: 'var(--t3)', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
                      >×</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 最近分析历史 */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px' }}>
            <div style={{
              fontSize: 10, color: 'var(--t3)', fontWeight: 600, letterSpacing: '0.5px',
              textTransform: 'uppercase', marginBottom: 6,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>最近分析</span>
              <span style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => navigate('user')}>全部</span>
            </div>
            {displayResult ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6, fontSize: 11 }}>
                <span style={{ color: displayResult.scoring.direction === 'long' ? 'var(--green)' : displayResult.scoring.direction === 'short' ? 'var(--red)' : 'var(--primary)', fontWeight: 700 }}>
                  {displayResult.scoring.direction === 'long' ? '▲' : displayResult.scoring.direction === 'short' ? '▼' : '◆'}
                </span>
                <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{displaySymbol}</span>
                <span style={{ color: 'var(--t3)', marginLeft: 'auto' }}>{cacheTimeLabel}</span>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--t3)', padding: '4px 6px' }}>暂无分析记录</div>
            )}
          </div>
        </div>
        )} {/* end !isMobile sidebar */}

        {/* ── 主内容区 ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, paddingBottom: isMobile ? 56 : 0 }}>

          {/* ── 手机端横向币种选择栏（替代左侧边栏） ── */}
          {isMobile && (
            <div className="mobile-symbol-scroll" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderBottom: '1px solid var(--border)',
              background: 'var(--bg2)', flexShrink: 0,
            }}>
              {watchlist.map(sym => {
                const meta = getSymbolMeta(sym);
                const isActive = sym === symbol;
                return (
                  <button
                    key={sym}
                    onClick={() => handleSymbolChange(sym)}
                    style={{
                      flexShrink: 0, padding: '4px 10px', borderRadius: 20,
                      background: isActive ? 'rgba(240,180,41,0.12)' : 'var(--bg3)',
                      border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                      color: isActive ? 'var(--primary)' : 'var(--t2)',
                      fontSize: 12, fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {meta.icon} {meta.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── 顶部工具栏 ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8,
            padding: isMobile ? '6px 10px' : '8px 14px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg2)', flexShrink: 0, flexWrap: 'wrap',
          }}>
            {/* Symbol + price */}
            <div style={{
              background: 'var(--bg3)', border: '1px solid var(--border)',
              padding: '4px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>{displaySymbol}</div>

            {price > 0 && (
              <>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>
                  ${formatPrice(price, symbol)}
                </div>
                <div style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: isPos ? 'rgba(0,200,150,0.12)' : 'rgba(255,77,109,0.12)',
                  color: isPos ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap',
                }}>
                  {isPos ? '▲' : '▼'} {formatPercent(Math.abs(priceChange))}
                </div>
              </>
            )}

            {/* 周期切换 */}
            <div style={{ display: 'flex', gap: 3 }}>
              {TF_LIST.map(tf => (
                <button key={tf.key} onClick={() => handleTimeframeChange(tf.key)} style={{
                  padding: '3px 9px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  background: activeTimeframe === tf.key ? 'rgba(240,180,41,0.1)' : 'transparent',
                  border: `1px solid ${activeTimeframe === tf.key ? 'var(--primary)' : 'var(--border)'}`,
                  color: activeTimeframe === tf.key ? 'var(--primary)' : 'var(--t2)',
                  transition: 'all .15s',
                }}>{tf.label}</button>
              ))}
            </div>

            <div style={{ flex: 1 }} />

            {/* 缓存提示 + 重新分析按钮 */}
            {displayResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* 时效状态标签：优先展示 freshnessStatus，内存缓存过期时用 cacheExpired */}
                {(freshnessStatus === 'expired' || (freshnessStatus === 'fresh' && cacheExpired)) && (
                  <span style={{ fontSize: 10, color: 'var(--red)', background: 'rgba(239,68,68,0.08)', padding: '2px 7px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.25)', whiteSpace: 'nowrap' }}>
                    数据已过期，建议重新分析
                  </span>
                )}
                {freshnessStatus === 'stale' && !cacheExpired && (
                  <span style={{ fontSize: 10, color: 'var(--warn)', background: 'rgba(245,158,11,0.1)', padding: '2px 7px', borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)', whiteSpace: 'nowrap' }}>
                    数据来自 {cacheTimeLabel}，建议刷新
                  </span>
                )}
                {freshnessStatus === 'fresh' && !cacheExpired && cacheTimeLabel && (
                  <span style={{ fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                    数据来自 {cacheTimeLabel}
                  </span>
                )}
                <button
                  onClick={handleForceReanalyze}
                  disabled={reanalyzeCooldown > 0 || loading}
                  title={reanalyzeCooldown > 0 ? `${reanalyzeCooldown}s 后可重新分析` : '强制重新分析'}
                  style={{
                    padding: '3px 9px', borderRadius: 6, fontSize: 11, cursor: reanalyzeCooldown > 0 || loading ? 'not-allowed' : 'pointer',
                    border: `1px solid ${freshnessStatus === 'expired' ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                    background: freshnessStatus === 'expired' ? 'rgba(239,68,68,0.06)' : 'transparent',
                    color: reanalyzeCooldown > 0 ? 'var(--t4)' : freshnessStatus === 'expired' ? 'var(--red)' : 'var(--t2)',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <RefreshCw size={10} />
                  {reanalyzeCooldown > 0 ? `${reanalyzeCooldown}s` : t.nav.reanalyze}
                </button>
              </div>
            )}

            {/* 今日剩余次数 / 订阅状态 */}
            {(() => {
              const quota = quotaInfo;
              const label = quota.isActive
                ? t.nav.todayRemain(quota.daily, quota.total)
                : quota.expireAt ? t.nav.subscriptionExpired : t.nav.noSubscription;
              const color = !quota.isActive ? 'var(--red)' : quota.daily <= 5 ? 'var(--warn)' : 'var(--primary)';
              const bg = !quota.isActive ? 'rgba(239,68,68,0.08)' : quota.daily <= 5 ? 'rgba(245,158,11,0.08)' : 'rgba(240,180,41,0.08)';
              const border = !quota.isActive ? 'rgba(239,68,68,0.25)' : quota.daily <= 5 ? 'rgba(245,158,11,0.3)' : 'rgba(240,180,41,0.2)';
              return (
                <div
                  onClick={() => { setQuotaBlockReason(''); setShowCreditsModal(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                    background: bg, border: `1px solid ${border}`,
                    fontSize: 12, color, whiteSpace: 'nowrap',
                  }}
                >⚡ <strong>{label}</strong></div>
              );
            })()}

            {/* 自动刷新（手机端隐藏） */}
            {!isMobile && <button onClick={() => setAutoRefresh(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 3, padding: '4px 9px',
              border: `1px solid ${autoRefresh ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 8, background: autoRefresh ? 'rgba(240,180,41,0.08)' : 'transparent',
              color: autoRefresh ? 'var(--primary)' : 'var(--t3)', fontSize: 11, cursor: 'pointer',
            }}>
              <Activity size={11} />{autoRefresh ? t.nav.auto : t.nav.manual}
            </button>}

            {/* 语言切换 */}
            <button
              onClick={toggleLang}
              style={{
                padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--t2)', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >{t.nav.langToggle}</button>

            {/* 通知 */}
            <div style={{ position: 'relative' }}>
              <div id="notifBtn" onClick={() => setShowNotif(v => !v)} style={{
                width: 32, height: 32, borderRadius: 9, background: 'var(--bg3)',
                border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', fontSize: 15, position: 'relative',
              }}>
                🔔
                <span style={{
                  position: 'absolute', top: 5, right: 5, width: 7, height: 7,
                  borderRadius: '50%', background: 'var(--red)', border: '2px solid var(--bg2)',
                }} />
              </div>
              {showNotif && (
                <div id="notifPanel">
                  <NotifPanel onClose={() => setShowNotif(false)} onGoRecharge={() => { setShowNotif(false); navigate('recharge'); }} uid={user?.uid} />
                </div>
              )}
            </div>

            {/* AI分析 */}
            <button onClick={() => handleAnalyze()} disabled={loading} style={{
              padding: '5px 14px', borderRadius: 8,
              background: 'linear-gradient(135deg, #f0b429, #e8920a)',
              color: '#000', fontWeight: 700, fontSize: 13, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, opacity: loading ? 0.7 : 1, whiteSpace: 'nowrap',
            }}>
              <RefreshCw size={13} className={loading ? 'spin-slow' : ''} />
              {loading ? t.nav.analyzing : t.nav.aiAnalysis}
            </button>

            {/* 推送按钮（手机端隐藏） */}
            {!isMobile && <button onClick={() => setShowAlertModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: 3, padding: '4px 9px',
              border: `1px solid ${pushConfig.enabled ? 'var(--green)' : 'var(--border)'}`,
              borderRadius: 8, background: pushConfig.enabled ? 'rgba(0,200,150,0.08)' : 'transparent',
              color: pushConfig.enabled ? 'var(--green)' : 'var(--t3)', fontSize: 11, cursor: 'pointer',
            }}>
              <Bell size={11} /> 推送
            </button>}

            {/* 更新时间（手机端隐藏） */}
            {!isMobile && <div style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: loading ? '#f59e0b' : displayResult ? 'var(--green)' : 'var(--t3)',
                animation: loading ? 'badge-pulse 0.8s infinite' : undefined,
              }} />
              {loading ? '分析中...' : displayResult ? cacheTimeLabel + ' 更新' : '未分析'}
            </div>}

            {/* 管理员后台入口 */}
            {user?.isAdmin && (
              <button onClick={() => navigate('admin')} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: 'rgba(240,180,41,0.15)', color: 'var(--primary)',
                border: '1px solid rgba(240,180,41,0.4)', cursor: 'pointer',
              }}>⚙️ 后台</button>
            )}

            {/* Avatar */}
            <div style={{ position: 'relative' }}>
              <button id="avatarBtn" onClick={() => setShowAvatarDd(v => !v)} style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'linear-gradient(135deg,#f0b429,#b7791f)',
                border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                color: '#1a0a00', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {user?.name?.[0]?.toUpperCase() ?? 'U'}
              </button>
              {showAvatarDd && (
                <div id="avatarDd">
                  <AvatarDropdown
                    user={user}
                    onClose={() => setShowAvatarDd(false)}
                    onUser={() => { setShowAvatarDd(false); navigate('user'); }}
                    onRecharge={() => { setShowAvatarDd(false); navigate('recharge'); }}
                    onFeedback={() => { setShowAvatarDd(false); setShowFeedbackModal(true); }}
                    onAdmin={() => { setShowAvatarDd(false); navigate('admin'); }}
                    onLogout={() => { setShowAvatarDd(false); localStorage.removeItem(LS_LAST_QUERY_KEY); localStorage.removeItem(LS_RESULT_KEY); localStorage.removeItem(LS_AI_REPORT_KEY); navigate('landing'); }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── 图表+右面板 ── */}
          <div style={{ flex: 1, display: isMobile && mobileTab !== 'chart' ? 'none' : 'flex', overflow: 'hidden', minHeight: 0 }}>

            {/* 图表区（手机端仅 chart tab 时展开） */}
            <div style={{
              flex: 1, display: isMobile && mobileTab !== 'chart' ? 'none' : 'flex',
              flexDirection: 'column',
              borderRight: isMobile ? 'none' : '1px solid var(--border)',
              overflow: isMobile ? 'auto' : 'hidden', minWidth: 0,
            }}>

              {/* 策略提示条 */}
              {displayResult && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderBottom: '1px solid var(--border)',
                  background: 'var(--bg2)', flexShrink: 0, fontSize: 12, flexWrap: 'wrap',
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{displaySymbol}</span>
                  <span style={{ color: 'var(--t3)' }}>·</span>
                  <span style={{ color: 'var(--t2)' }}>{tfConf.strategyType}</span>
                  <span style={{ color: 'var(--t3)' }}>·</span>
                  <span style={{ color: 'var(--t3)' }}>仓位 {tfConf.positionMin}–{tfConf.positionMax}%</span>
                  <span style={{ color: 'var(--t3)' }}>·</span>
                  <span style={{ color: 'var(--t3)' }}>时间止损 {displayResult.risk.timeStopHours}H</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ color: 'var(--t3)', fontSize: 11, fontFamily: 'monospace' }}>{chartKlines.length} 根K线</span>
                </div>
              )}

              {/* K线图 */}
              <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', ...(isMobile ? {} : { flex: 1, minHeight: 0 }) }}>
                {/* 未分析引导 */}
                {!displayResult && !loading && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 10,
                    background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)',
                  }}>
                    <div style={{ fontSize: 48 }}>🎯</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>欢迎使用 AI威科夫Pro！</div>
                    <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7, textAlign: 'center' }}>
                      {(() => {
                        const q = quotaInfo;
                        return q.isActive
                          ? <>今日剩余 <strong style={{ color: 'var(--primary)' }}>{q.daily}/{q.total} 次</strong> AI 分析配额</>
                          : <span style={{ color: 'var(--red)' }}>请先<strong onClick={() => navigate('recharge')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>订阅套餐</strong>后使用</span>;
                      })()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 260 }}>
                      {['在左侧选择币种', '选择分析周期（15m / 1H / 4H / 1D）', '点击「🤖 AI分析」获取报告'].map((text, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.85)', borderRadius: 10, padding: '9px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,122,255,0.12)', color: 'var(--primary)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                          <div style={{ fontSize: 12, color: 'var(--t1)' }}>{text}</div>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => handleAnalyze()} style={{
                      padding: '9px 28px', borderRadius: 10,
                      background: 'linear-gradient(135deg, #f0b429, #e8920a)',
                      color: '#000', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
                    }}>开始分析 →</button>
                  </div>
                )}

                {/* K线 + VP */}
                <div style={{ display: 'flex', height: isMobile ? 240 : 300, flexShrink: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <CandlestickChart klines={chartKlines} height={isMobile ? 240 : 300} symbol={symbol} timeframe={activeTimeframe} />
                  </div>
                  {displayResult && (
                    <div style={{ width: 72, background: 'var(--bg3)', borderLeft: '1px solid var(--border)', flexShrink: 0, overflow: 'hidden' }}>
                      <VolumeProfileBar profile={displayResult.volumeProfile} symbol={symbol} currentPrice={displayResult.price} height={isMobile ? 240 : 300} />
                    </div>
                  )}
                </div>

                {/* 指标栏（可折叠） */}
                <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg2)', ...(isMobile ? { margin: '0 0' } : {}) }}>
                  {/* 指标栏标题行（点击折叠） */}
                  <div
                    onClick={() => setIndicatorExpanded(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 14px', cursor: 'pointer',
                      borderBottom: indicatorExpanded ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)' }}>技术指标</span>
                    <div style={{ flex: 1 }} />
                    {indicatorExpanded ? <ChevronUp size={12} color="var(--t3)" /> : <ChevronDown size={12} color="var(--t3)" />}
                  </div>

                  {indicatorExpanded && (
                    <div style={{ padding: '8px 14px 10px', overflowX: 'auto' }}>
                      {displayResult ? (
                        <IndicatorPanel indicators={displayResult.primaryIndicators} symbol={symbol} />
                      ) : (
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                          {['RSI(14)', 'MACD', 'BB位置', 'ADX', 'ATR'].map(label => (
                            <div key={label} style={{ textAlign: 'center', minWidth: 48 }}>
                              <div style={{ fontSize: 10, color: 'var(--t3)' }}>{label}</div>
                              <div style={{ height: 14, background: 'var(--bg3)', borderRadius: 4, marginTop: 4, width: 44 }} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 订单簿 */}
              {displayResult && (
                <div style={{
                  flexShrink: 0,
                  margin: isMobile ? '8px 8px 0' : '0',
                  ...(isMobile ? { maxHeight: 200, overflow: 'hidden' } : {}),
                }}>
                  <OrderBookHeatmap symbol={symbol} currentPrice={displayResult.price} compact={isMobile} />
                </div>
              )}
            </div>

            {/* ── 右侧面板（大屏显示，手机隐藏） ── */}
            {!isMobile && (
            <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                {([
                  { key: 'ai', label: 'AI策略报告' },
                  { key: 'wyckoff', label: '威科夫分析' },
                  { key: 'news', label: '社交热度' },
                ] as { key: RightPanelTab; label: string }[]).map(t => (
                  <div key={t.key} onClick={() => setRightTab(t.key)} style={{
                    flex: 1, padding: 9, textAlign: 'center', fontSize: 12, fontWeight: 600,
                    color: rightTab === t.key ? 'var(--primary)' : 'var(--t3)',
                    cursor: 'pointer',
                    borderBottom: rightTab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
                    background: rightTab === t.key ? 'rgba(240,180,41,0.05)' : 'transparent',
                    transition: 'all .15s',
                  }}>{t.label}</div>
                ))}
              </div>

              {/* Panel content — key 变化时触发 fadeIn 动效 */}
              <div
                key={`${rightTab}-${displayResult?.timestamp ?? 'empty'}`}
                className="animate-fade-in"
                style={{ flex: 1, overflowY: 'auto', background: 'var(--bg2)' }}
              >
                {rightTab === 'ai' && (
                  displayResult ? (
                    <div style={{ padding: 14 }}>
                      <ReportPanel result={{ ...displayResult, news: [] }} activeTimeframe={activeTimeframe} />
                    </div>
                  ) : (
                    <EmptyPanelGuide onAnalyze={() => handleAnalyze()} />
                  )
                )}
                {rightTab === 'wyckoff' && (
                  displayResult ? (
                    <WyckoffPane result={displayResult} />
                  ) : (
                    <EmptyPanelGuide onAnalyze={() => handleAnalyze()} />
                  )
                )}
                {rightTab === 'news' && (
                  <div style={{ padding: 14 }}>
                    <TrendingPanel />
                  </div>
                )}
              </div>
            </div>
            )} {/* end !isMobile right panel */}
          </div>

          {/* ── 手机端底部内容区（仅当 mobileTab !== 'chart' 时显示） ── */}
          {isMobile && mobileTab !== 'chart' && (
            <div
              key={`mobile-${mobileTab}-${displayResult?.timestamp ?? 'empty'}`}
              className="animate-fade-in"
              style={{ flex: 1, overflowY: 'auto', background: 'var(--bg2)', minHeight: 0 }}
            >
              {mobileTab === 'report' && (
                displayResult ? (
                  <div style={{ padding: 14, paddingBottom: 72 }}>
                    <ReportPanel result={{ ...displayResult, news: [] }} activeTimeframe={activeTimeframe} />
                  </div>
                ) : (
                  <div style={{ paddingBottom: 72 }}><EmptyPanelGuide onAnalyze={() => handleAnalyze()} /></div>
                )
              )}
              {mobileTab === 'wyckoff' && (
                displayResult ? (
                  <div style={{ paddingBottom: 72 }}><WyckoffPane result={displayResult} /></div>
                ) : (
                  <div style={{ paddingBottom: 72 }}><EmptyPanelGuide onAnalyze={() => handleAnalyze()} /></div>
                )
              )}
              {mobileTab === 'news' && (
                <div style={{ padding: 14, paddingBottom: 72 }}>
                  <TrendingPanel />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 手机端底部Tab栏 ── */}
      {isMobile && (
        <div className="mobile-tab-bar">
          {([
            { key: 'chart', icon: '📊', label: '图表' },
            { key: 'report', icon: '🤖', label: 'AI报告' },
            { key: 'wyckoff', icon: '🦞', label: '威科夫' },
            { key: 'news', icon: '🔥', label: '热度' },
          ] as { key: MobileTab; icon: string; label: string }[]).map(t => (
            <button
              key={t.key}
              className={`mobile-tab-item${mobileTab === t.key ? ' active' : ''}`}
              onClick={() => setMobileTab(t.key)}
            >
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}


      {pushStatus && (
        <div style={{
          position: 'fixed', bottom: 20, left: 20, zIndex: 200,
          padding: '12px 16px', borderRadius: 12, fontSize: 13,
          background: 'var(--bg2)', border: '1px solid rgba(0,200,150,0.3)',
          color: 'var(--green)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }} className="animate-fade-in">
          {pushStatus}
        </div>
      )}

      {showAlertModal && (
        <WechatAlertModal onClose={() => setShowAlertModal(false)} onSave={setPushConfig} />
      )}

      {showCreditsModal && (
        <CreditsModal
          onClose={() => setShowCreditsModal(false)}
          onRecharge={() => { setShowCreditsModal(false); navigate('recharge'); }}
          reason={quotaBlockReason}
          uid={user?.uid}
        />
      )}

      {/* 反馈弹窗 */}
      {showFeedbackModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 3500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowFeedbackModal(false); }}
        >
          <div style={{ background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '28px 24px', maxWidth: 440, width: '92%', position: 'relative' }}>
            <button onClick={() => setShowFeedbackModal(false)} style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', color: 'var(--t3)', fontSize: 22, cursor: 'pointer' }}>×</button>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18, color: 'var(--t1)' }}>💬 意见反馈</div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 8 }}>反馈类型</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {([['bug','🐛 Bug'], ['feature','💡 建议'], ['complaint','🚨 投诉'], ['other','💬 其他']] as const).map(([k, label]) => (
                  <div key={k} onClick={() => setFeedbackType(k)} style={{
                    padding: '6px 4px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', fontSize: 11,
                    border: `1.5px solid ${feedbackType === k ? 'var(--primary)' : 'var(--border)'}`,
                    background: feedbackType === k ? 'rgba(0,122,255,0.08)' : 'var(--bg3)',
                    color: feedbackType === k ? 'var(--primary)' : 'var(--t2)',
                    fontWeight: feedbackType === k ? 700 : 400,
                  }}>{label}</div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 8 }}>问题描述</div>
              <textarea
                value={feedbackContent}
                onChange={e => setFeedbackContent(e.target.value)}
                placeholder="请描述您遇到的问题或建议..."
                style={{
                  width: '100%', minHeight: 100, padding: '10px 12px',
                  borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--bg3)', color: 'var(--t1)', fontSize: 13,
                  resize: 'vertical', boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>
            <button
              disabled={feedbackSubmitting || !feedbackContent.trim()}
              onClick={async () => {
                if (!user || !feedbackContent.trim()) return;
                setFeedbackSubmitting(true);
                try {
                  const { submitFeedback } = await import('../utils/feedbackStore');
                  const result = await submitFeedback({ uid: user.uid, email: user.email }, feedbackType, feedbackContent.trim());
                  if (result) {
                    showToast('✅ 反馈已提交，感谢您的建议！');
                    setFeedbackContent('');
                    setShowFeedbackModal(false);
                  } else {
                    showToast('❌ 提交失败，请稍后重试');
                  }
                } finally {
                  setFeedbackSubmitting(false);
                }
              }}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 10, border: 'none',
                background: feedbackContent.trim() ? 'linear-gradient(135deg, #f0b429, #e8920a)' : 'var(--bg3)',
                color: feedbackContent.trim() ? '#000' : 'var(--t3)',
                fontWeight: 700, fontSize: 14, cursor: feedbackContent.trim() ? 'pointer' : 'default',
              }}
            >{feedbackSubmitting ? '提交中...' : '提交反馈'}</button>
          </div>
        </div>
      )}

      {/* 新手引导蒙版（首次登录后显示） */}
      {showOnboarding && user && (
        <div
          onClick={() => { setShowOnboarding(false); try { localStorage.setItem('wyckoff_onboarding_done_v1', '1'); } catch {} }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 20,
              padding: '40px 36px', maxWidth: 460, width: '90%', textAlign: 'center',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: 'var(--t1)' }}>欢迎使用 AI威科夫Pro</h2>
            <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7, marginBottom: 28 }}>
              3步开始你的第一次专业分析
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
              {[
                { step: 1, icon: '🪙', title: '选择币种', desc: '在左侧边栏搜索或点击自选列表中的任意币种' },
                { step: 2, icon: '⏱', title: '选择分析周期', desc: '在顶部选择 15m / 1H / 4H / 1D 其中一个周期' },
                { step: 3, icon: '🤖', title: '点击 AI分析', desc: '点击右上角「🤖 AI分析」按钮，获取完整策略报告' },
              ].map(item => (
                <div key={item.step} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                  background: 'var(--bg3)', borderRadius: 12, textAlign: 'left',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg,#f0b429,#e8920a)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, color: '#000',
                  }}>{item.step}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 3 }}>
                      {item.icon} {item.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t2)' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setShowOnboarding(false); try { localStorage.setItem('wyckoff_onboarding_done_v1', '1'); } catch {} }}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg,#f0b429,#e8920a)',
                color: '#000', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              }}
            >
              开始使用 →
            </button>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 12 }}>点击任意处关闭 · 下次不再显示</div>
          </div>
        </div>
      )}
    </div>
  );
}

// 空状态引导
function EmptyPanelGuide({ onAnalyze }: { onAnalyze: () => void }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 40 }}>🤖</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>等待 AI 分析</div>
      <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>点击顶部「AI分析」按钮<br />获取专业分析报告</div>
      <button onClick={onAnalyze} style={{
        marginTop: 8, padding: '8px 20px', borderRadius: 8,
        background: 'linear-gradient(135deg, #f0b429, #e8920a)',
        color: '#000', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
      }}>立即分析</button>
    </div>
  );
}

// 威科夫分析面板
function WyckoffPane({ result }: { result: any }) {
  const phaseMap: Record<string, { label: string; color: string; bg: string; desc: string }> = {
    accumulation: { label: '积累阶段', color: '#059669', bg: 'rgba(5,150,105,0.08)', desc: '机构低位吸筹，价格在区间内震荡，成交量逐步萎缩' },
    markup:       { label: '上涨推动', color: '#2563eb', bg: 'rgba(37,99,235,0.08)', desc: '突破积累区，主力推升价格，成交量放大确认趋势' },
    distribution: { label: '派发阶段', color: '#d97706', bg: 'rgba(217,119,6,0.08)',  desc: '机构高位出货，价格在高位区间震荡，量价出现背离' },
    markdown:     { label: '下跌趋势', color: '#dc2626', bg: 'rgba(220,38,38,0.08)',  desc: '跌破派发区支撑，空头主导，逢反弹减仓' },
  };
  const patternMap: Record<string, { label: string; color: string; desc: string }> = {
    spring:   { label: '弹簧效应 Spring', color: '#059669', desc: '价格假跌破支撑后快速收复，是积累末期强烈反转信号' },
    upthrust: { label: '假突破 UpThrust', color: '#dc2626', desc: '价格假突破阻力后快速回落，是派发末期强烈反转信号' },
    sos:      { label: '力量迹象 SOS',    color: '#2563eb', desc: '放量突破关键阻力，多头力量占优，确认上涨阶段开始' },
    sow:      { label: '弱势迹象 SOW',    color: '#d97706', desc: '量增价跌或成交量异常放大后回落，空头力量占优' },
    none:     { label: '无明显形态',       color: '#94a3b8', desc: '当前价格结构尚未形成明确的威科夫形态信号，建议继续观察' },
  };

  const phase   = result.wyckoff?.phase   ?? 'accumulation';
  const pattern = result.wyckoff?.pattern ?? 'none';
  const phaseConf  = result.wyckoff?.phaseConfidence ?? 0;
  const patternConf = result.wyckoff?.patternConfidence ?? 0;
  const phaseInfo   = phaseMap[phase]   ?? phaseMap.accumulation;
  const patternInfo = patternMap[pattern] ?? patternMap.none;

  const ce = result.wyckoff?.causeAndEffect;
  const tfs: Array<{ key: string; label: string }> = [
    { key: '1d', label: '日线' },
    { key: '4h', label: '4小时' },
    { key: '1h', label: '1小时' },
    { key: '15m', label: '15分钟' },
  ];

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* 当前阶段 */}
      <div style={{
        background: phaseInfo.bg, border: `1px solid ${phaseInfo.color}33`,
        borderLeft: `3px solid ${phaseInfo.color}`,
        borderRadius: 10, padding: '11px 13px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: phaseInfo.color }}>{phaseInfo.label}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
            background: `${phaseInfo.color}18`, color: phaseInfo.color,
            border: `1px solid ${phaseInfo.color}40`,
          }}>置信度 {typeof phaseConf === 'number' ? phaseConf.toFixed(2) : phaseConf}%</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.65, margin: 0 }}>{phaseInfo.desc}</p>
      </div>

      {/* 当前形态（有明确形态时才展示，与阶段互补） */}
      {pattern !== 'none' && (
        <div style={{
          background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: patternInfo.color }}>{patternInfo.label}</span>
            {patternConf > 0 && (
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>置信度 {typeof patternConf === 'number' ? patternConf.toFixed(2) : patternConf}%</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.65, margin: 0 }}>{patternInfo.desc}</p>
        </div>
      )}

      {/* 复合人动向（量价背离时附加警示） */}
      {result.wyckoff?.compositeManBehavior && (
        <div style={{
          background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)',
          borderRadius: 10, padding: '11px 13px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', marginBottom: 5 }}>⚡ 复合人（主力）动向</div>
          <p style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.7, margin: 0 }}>
            {result.wyckoff.compositeManBehavior}
          </p>
          {result.wyckoff.volumeVerification === 'divergence' && (
            <div style={{
              marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 9px', borderRadius: 7,
              background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)',
            }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>量价背离 · 注意反转风险</span>
            </div>
          )}
        </div>
      )}

      {/* 量价验证（非背离时展示） */}
      {result.wyckoff?.volumeVerification && result.wyckoff.volumeVerification !== 'divergence' && (() => {
        const vv = result.wyckoff.volumeVerification;
        const vMap: Record<string, { icon: string; label: string; color: string }> = {
          bullish:    { icon: '✅', label: '量价健康，多头主导', color: '#059669' },
          bearish:    { icon: '⚠️', label: '放量下跌，空头强势', color: '#dc2626' },
          divergence: { icon: '⚠️', label: '量价背离，注意风险', color: '#d97706' },
          neutral:    { icon: '—',  label: '量价中性，方向待定', color: '#94a3b8' },
        };
        const v = vMap[vv] ?? vMap.neutral;
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 13px', borderRadius: 10,
            background: 'var(--bg3)', border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 18 }}>{v.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: v.color }}>{v.label}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>量价验证</div>
            </div>
          </div>
        );
      })()}

      {/* 因果法则：只保留区间幅度，目标价已在 AI策略报告 止盈区展示 */}
      {ce && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 13px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)' }}>📐 因果法则·积累区间幅度</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>
              ±${ce.accumulationRange?.toFixed(0) ?? '-'}
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--t3)', margin: '4px 0 0', lineHeight: 1.5 }}>
            目标价参见「AI策略报告」止盈区
          </p>
        </div>
      )}

      {/* 多周期共振 */}
      {result.indicators && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 7 }}>🔄 多周期 RSI 共振</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {tfs.map(({ key, label }) => {
              const ind = result.indicators[key];
              if (!ind) return null;
              const bullish = ind.rsi > 50 && ind.macdState?.includes('看涨');
              const bearish = ind.rsi < 50 && ind.macdState?.includes('看跌');
              const color = bullish ? '#059669' : bearish ? '#dc2626' : '#d97706';
              const signal = bullish ? '偏多' : bearish ? '偏空' : '中性';
              return (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ color: 'var(--t2)', fontWeight: 500 }}>{label}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: 'var(--t3)', fontSize: 11 }}>RSI {ind.rsi?.toFixed(0)}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 20,
                      background: `${color}18`, color, border: `1px solid ${color}40`,
                    }}>{signal}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5维综合评分 */}
      {result.scoring?.dims && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 7 }}>📊 五维综合评分</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              { key: 'wyckoff',   label: '威科夫形态确认', icon: '🔭', score: result.scoring.dims.wyckoff,   color: '#2563eb' },
              { key: 'volume',    label: '成交量配合度',   icon: '📦', score: result.scoring.dims.volume,    color: '#059669' },
              { key: 'momentum',  label: '多周期技术共振', icon: '⚡', score: result.scoring.dims.momentum,  color: '#7c3aed' },
              { key: 'sentiment', label: '消息面情绪',     icon: '📰', score: result.scoring.dims.sentiment, color: '#d97706' },
              { key: 'orderbook', label: '订单簿筹码压力', icon: '📋', score: result.scoring.dims.orderbook, color: '#0ea5e9' },
            ].map((dim) => {
              const pct = Math.max(0, Math.min(100, dim.score));
              const dimColor = pct >= 65 ? dim.color : pct >= 40 ? '#d97706' : '#dc2626';
              return (
                <div key={dim.key}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>
                      {dim.icon} {dim.label}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11, color: dimColor }}>
                      {pct}
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${pct}%`, background: dimColor,
                      transition: 'width 0.7s',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
