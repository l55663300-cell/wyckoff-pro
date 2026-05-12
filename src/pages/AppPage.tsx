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
import { SentimentPanel } from '../components/indicators/SentimentPanel';
import { VSASignalPanel } from '../components/wyckoff/VSASignalPanel';
import { WechatAlertModal } from '../components/WechatAlertModal';
import { WechatPushConfig, loadPushConfig, sendWechatPush, buildEntryAlertMessage } from '../utils/wechatPush';
import { formatPrice, formatPercent } from '../utils/formatters';
import { useApp } from '../context/AppContext';
import { CreditsModal } from '../components/modals/CreditsModal';
import { NotifPanel } from '../components/modals/NotifPanel';
import { AvatarDropdown } from '../components/modals/AvatarDropdown';
import { addQueryRecord } from '../utils/queryStore';
import { addFavCoin, removeFavCoin, loadFavCoins, fetchFavCoins } from '../utils/queryStore';
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

type RightPanelTab = 'ai' | 'wyckoff' | 'signals' | 'news';

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
  // 收藏币种（先用 localStorage 初始化，再异步从 Supabase 同步最新）
  const [favCoins, setFavCoins] = useState<string[]>(() => user ? loadFavCoins(user.uid) : []);
  useEffect(() => {
    if (user) {
      fetchFavCoins(user.uid).then(coins => setFavCoins(coins));
    }
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const dir = result.scoring.direction === 'long' ? t.report.dirLong : result.scoring.direction === 'short' ? t.report.dirShort : t.report.dirNeutral;
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
        setPushStatus(res.ok ? t.appPage.pushEnabled : t.appPage.pushFailed(res.msg ?? ''));
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
          setPushStatus(prev => prev ? t.appPage.emailAppended(prev) : t.appPage.emailSent);
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
    if (/[\u4e00-\u9fa5]/.test(sym)) { setSymInputErr(t.appPage.searchNoSupport); return; }
    const full = sym.endsWith('USDT') ? sym : sym + 'USDT';
    if (watchlist.includes(full)) { setSymInputErr(t.appPage.searchAlreadyIn(full)); return; }
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
  type MobileTab = 'report' | 'wyckoff' | 'indicators';
  const [mobileTab, setMobileTab] = useState<MobileTab>('report');

  const [mobileSearchVisible, setMobileSearchVisible] = useState(false);
  const [mobileSearchInput, setMobileSearchInput] = useState('');

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
              title={t.appPage.sidebarTitle}
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
              placeholder={t.appPage.sidebarSearch}
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
                    <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--red)' }}>⚠ {t.appPage.searchNoSupport}</div>
                  ) : alreadyIn ? (
                    <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--t3)' }}>{t.appPage.searchAlreadyIn(full)}</div>
                  ) : !isValidFormat ? (
                    <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--t3)' }}>{t.appPage.searchInvalidFormat}</div>
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
            <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', padding: '4px 8px' }}>{t.appPage.sidebarWatchlist}</div>
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
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} title={t.appPage.cachedDot} />
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
                        title={isFav ? t.appPage.sidebarFavTitle : t.appPage.sidebarFavAdd}
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
              <span>{t.appPage.sidebarRecentAnalysis}</span>
              <span style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => navigate('user')}>{t.appPage.sidebarViewAll}</span>
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
              <div style={{ fontSize: 11, color: 'var(--t3)', padding: '4px 6px' }}>{t.appPage.sidebarNoHistory}</div>
            )}
          </div>
        </div>
        )} {/* end !isMobile sidebar */}

        {/* ── 主内容区 ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, paddingBottom: isMobile ? 56 : 0 }}>

          {/* ── 手机端横向币种选择栏（替代左侧边栏） ── */}
          {isMobile && (
            <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              {/* 搜索栏（展开时显示） */}
              {mobileSearchVisible && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
                  <input
                    autoFocus
                    value={mobileSearchInput}
                    onChange={e => { setMobileSearchInput(e.target.value); setSymInputErr(''); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const raw = mobileSearchInput.trim().toUpperCase();
                        if (!raw) return;
                        const full = raw.endsWith('USDT') ? raw : raw + 'USDT';
                        if (!watchlist.includes(full)) {
                          const next = [...watchlist, full];
                          setWatchlist(next); saveWatchlist(next);
                        }
                        handleSymbolChange(full as Symbol);
                        setMobileSearchInput(''); setMobileSearchVisible(false);
                      }
                      if (e.key === 'Escape') { setMobileSearchVisible(false); setMobileSearchInput(''); }
                    }}
                    placeholder={t.appPage.mobilePlaceholder}
                    style={{
                      flex: 1, padding: '7px 10px', borderRadius: 8,
                      background: 'var(--bg3)', border: '1px solid var(--primary)',
                      color: 'var(--t1)', fontSize: 13, outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => {
                      const raw = mobileSearchInput.trim().toUpperCase();
                      if (!raw) { setMobileSearchVisible(false); return; }
                      const full = raw.endsWith('USDT') ? raw : raw + 'USDT';
                      if (!watchlist.includes(full)) {
                        const next = [...watchlist, full];
                        setWatchlist(next); saveWatchlist(next);
                      }
                      handleSymbolChange(full as Symbol);
                      setMobileSearchInput(''); setMobileSearchVisible(false);
                    }}
                    style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--primary)', color: '#000', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}
                  >{t.appPage.mobileAddBtn}</button>
                  <button
                    onClick={() => { setMobileSearchVisible(false); setMobileSearchInput(''); }}
                    style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--t2)', fontSize: 13, border: '1px solid var(--border)', cursor: 'pointer' }}
                  >{t.appPage.mobileCancelBtn}</button>
                </div>
              )}
              {/* 横向滚动币种栏 */}
              <div className="mobile-symbol-scroll" style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', overflowX: 'auto',
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
                {/* 搜索按钮 */}
                <button
                  onClick={() => setMobileSearchVisible(true)}
                  style={{
                    flexShrink: 0, padding: '4px 10px', borderRadius: 20,
                    background: 'var(--bg3)', border: '1px dashed var(--border)',
                    color: 'var(--t3)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >{t.appPage.mobilePlusSearch}</button>
              </div>
            </div>
          )}

          {/* ── 顶部工具栏（移动端两行布局，桌面端单行） ── */}
          {isMobile ? (
            <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              {/* 移动端第一行：币种+价格 / 通知+头像 */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px 4px', gap: 8 }}>
                {/* 左：币种 + 价格 + 涨跌幅 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.3px' }}>{displaySymbol}</span>
                  {price > 0 && (
                    <>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', fontFamily: 'JetBrains Mono, monospace' }}>
                        ${formatPrice(price, symbol)}
                      </span>
                      <span style={{
                        padding: '1px 6px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                        background: isPos ? 'rgba(0,200,150,0.12)' : 'rgba(255,77,109,0.12)',
                        color: isPos ? 'var(--green)' : 'var(--red)',
                      }}>
                        {isPos ? '▲' : '▼'}{formatPercent(Math.abs(priceChange))}
                      </span>
                    </>
                  )}
                </div>
                {/* 右：语言切换 + 通知 + 头像 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button onClick={toggleLang} style={{
                    padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--t2)', cursor: 'pointer',
                  }}>{t.nav.langToggle}</button>
                  <div style={{ position: 'relative' }}>
                    <div id="notifBtn" onClick={() => setShowNotif(v => !v)} style={{
                      width: 30, height: 30, borderRadius: 8, background: 'var(--bg3)',
                      border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', cursor: 'pointer', fontSize: 14, position: 'relative',
                    }}>
                      🔔
                      <span style={{
                        position: 'absolute', top: 4, right: 4, width: 6, height: 6,
                        borderRadius: '50%', background: 'var(--red)', border: '2px solid var(--bg2)',
                      }} />
                    </div>
                    {showNotif && (
                      <div id="notifPanel">
                        <NotifPanel onClose={() => setShowNotif(false)} onGoRecharge={() => { setShowNotif(false); navigate('recharge'); }} uid={user?.uid} />
                      </div>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button id="avatarBtn" onClick={() => setShowAvatarDd(v => !v)} style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'linear-gradient(135deg,#f0b429,#b7791f)',
                      border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
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
              </div>
              {/* 移动端第二行：周期 / 积分状态 + AI分析 */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '4px 12px 8px', gap: 6 }}>
                {/* 周期切换 */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {TF_LIST.map(tf => (
                    <button key={tf.key} onClick={() => handleTimeframeChange(tf.key)} style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      background: activeTimeframe === tf.key ? 'rgba(240,180,41,0.1)' : 'transparent',
                      border: `1px solid ${activeTimeframe === tf.key ? 'var(--primary)' : 'var(--border)'}`,
                      color: activeTimeframe === tf.key ? 'var(--primary)' : 'var(--t2)',
                      transition: 'all .15s', fontWeight: activeTimeframe === tf.key ? 700 : 400,
                    }}>{tf.label}</button>
                  ))}
                </div>
                <div style={{ flex: 1 }} />
                {/* 重新分析（有数据时显示） */}
                {displayResult && (
                  <button
                    onClick={handleForceReanalyze}
                    disabled={reanalyzeCooldown > 0 || loading}
                    style={{
                      padding: '4px 8px', borderRadius: 6, fontSize: 11, cursor: reanalyzeCooldown > 0 || loading ? 'not-allowed' : 'pointer',
                      border: `1px solid ${freshnessStatus === 'expired' ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                      background: freshnessStatus === 'expired' ? 'rgba(239,68,68,0.06)' : 'transparent',
                      color: reanalyzeCooldown > 0 ? 'var(--t4)' : freshnessStatus === 'expired' ? 'var(--red)' : 'var(--t3)',
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}
                  >
                    <RefreshCw size={10} />
                    {reanalyzeCooldown > 0 ? `${reanalyzeCooldown}s` : t.nav.reanalyze}
                  </button>
                )}
                {/* 积分/订阅状态 */}
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
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 9px', borderRadius: 7, cursor: 'pointer',
                        background: bg, border: `1px solid ${border}`,
                        fontSize: 11, color, whiteSpace: 'nowrap',
                      }}
                    >⚡ <strong>{label}</strong></div>
                  );
                })()}
                {/* AI分析按钮 */}
                <button onClick={() => handleAnalyze()} disabled={loading} style={{
                  padding: '5px 14px', borderRadius: 8,
                  background: 'linear-gradient(135deg, #f0b429, #e8920a)',
                  color: '#000', fontWeight: 700, fontSize: 13, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4, opacity: loading ? 0.7 : 1, whiteSpace: 'nowrap',
                }}>
                  <RefreshCw size={12} className={loading ? 'spin-slow' : ''} />
                  {loading ? t.nav.analyzing : t.nav.aiAnalysis}
                </button>
              </div>
            </div>
          ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderBottom: '1px solid var(--border)',
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
                {(freshnessStatus === 'expired' || (freshnessStatus === 'fresh' && cacheExpired)) && (
                  <span style={{ fontSize: 10, color: 'var(--red)', background: 'rgba(239,68,68,0.08)', padding: '2px 7px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.25)', whiteSpace: 'nowrap' }}>
                    {t.appPage.dataExpired}
                  </span>
                )}
                {freshnessStatus === 'stale' && !cacheExpired && (
                  <span style={{ fontSize: 10, color: 'var(--warn)', background: 'rgba(245,158,11,0.1)', padding: '2px 7px', borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)', whiteSpace: 'nowrap' }}>
                    {t.appPage.dataStale(cacheTimeLabel ?? '')}
                  </span>
                )}
                {freshnessStatus === 'fresh' && !cacheExpired && cacheTimeLabel && (
                  <span style={{ fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                    {t.appPage.dataFrom(cacheTimeLabel)}
                  </span>
                )}
                <button
                  onClick={handleForceReanalyze}
                  disabled={reanalyzeCooldown > 0 || loading}
                  title={reanalyzeCooldown > 0 ? t.appPage.cooldownTitle(reanalyzeCooldown) : t.appPage.forceReanalyzeTitle}
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

            {/* 自动刷新 */}
            <button onClick={() => setAutoRefresh(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 3, padding: '4px 9px',
              border: `1px solid ${autoRefresh ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 8, background: autoRefresh ? 'rgba(240,180,41,0.08)' : 'transparent',
              color: autoRefresh ? 'var(--primary)' : 'var(--t3)', fontSize: 11, cursor: 'pointer',
            }}>
              <Activity size={11} />{autoRefresh ? t.nav.auto : t.nav.manual}
            </button>

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

            {/* 推送按钮 */}
            <button onClick={() => setShowAlertModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: 3, padding: '4px 9px',
              border: `1px solid ${pushConfig.enabled ? 'var(--green)' : 'var(--border)'}`,
              borderRadius: 8, background: pushConfig.enabled ? 'rgba(0,200,150,0.08)' : 'transparent',
              color: pushConfig.enabled ? 'var(--green)' : 'var(--t3)', fontSize: 11, cursor: 'pointer',
            }            }>
              <Bell size={11} /> {t.appPage.pushBtn}
            </button>

            {/* 更新时间 */}
            <div style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: loading ? '#f59e0b' : displayResult ? 'var(--green)' : 'var(--t3)',
                animation: loading ? 'badge-pulse 0.8s infinite' : undefined,
              }} />
              {loading ? t.appPage.analyzing : displayResult ? t.appPage.dataUpdated(cacheTimeLabel ?? '') : t.appPage.notAnalyzed}
            </div>

            {/* 管理员后台入口 */}
            {user?.isAdmin && (
              <button onClick={() => navigate('admin')} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: 'rgba(240,180,41,0.15)', color: 'var(--primary)',
                border: '1px solid rgba(240,180,41,0.4)', cursor: 'pointer',
              }}>{t.appPage.adminBtn}</button>
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
          )}

          {/* ── 图表+右面板（移动端隐藏图表区，只展示右侧面板内容） ── */}
          <div style={{ flex: 1, display: isMobile ? 'none' : 'flex', overflow: 'hidden', minHeight: 0 }}>

            {/* 图表区（手机端隐藏，桌面端展示） */}
            <div style={{
              flex: 1, display: 'flex',
              flexDirection: 'column',
              borderRight: '1px solid var(--border)',
              overflow: 'hidden', minWidth: 0,
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
                  <span style={{ color: 'var(--t3)' }}>{t.appPage.positionRange(tfConf.positionMin, tfConf.positionMax)}</span>
                  <span style={{ color: 'var(--t3)' }}>·</span>
                  <span style={{ color: 'var(--t3)' }}>{t.appPage.timeStopH(displayResult.risk.timeStopHours)}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ color: 'var(--t3)', fontSize: 11, fontFamily: 'monospace' }}>{t.appPage.klineCount(chartKlines.length)}</span>
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
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>{t.appPage.welcomeTitle}</div>
                    <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7, textAlign: 'center' }}>
                      {(() => {
                        const q = quotaInfo;
                        return q.isActive
                          ? t.appPage.quotaToday(q.daily, q.total)
                          : <span style={{ color: 'var(--red)' }}>{t.appPage.noSubHint}<strong onClick={() => navigate('recharge')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>{t.appPage.noSubLink}</strong>{t.appPage.noSubEnd}</span>;
                      })()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 260 }}>
                      {[t.appPage.guideStep1, t.appPage.guideStep2, t.appPage.guideStep3].map((text, i) => (
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
                    }}>{t.appPage.startAnalyzeBtn}</button>
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
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)' }}>{t.appPage.indicatorBarTitle}</span>
                    <div style={{ flex: 1 }} />
                    {indicatorExpanded ? <ChevronUp size={12} color="var(--t3)" /> : <ChevronDown size={12} color="var(--t3)" />}
                  </div>

                  {indicatorExpanded && (
                    <div style={{ padding: '8px 14px 10px', overflowX: 'auto' }}>
                      {displayResult ? (
                        <IndicatorPanel indicators={displayResult.primaryIndicators} symbol={symbol} />
                      ) : (
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                          {['RSI(14)', 'MACD', t.appPage.indicatorBBPos, 'ADX', 'ATR'].map(label => (
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
                  { key: 'ai', label: t.app.tabAI },
                  { key: 'wyckoff', label: t.app.tabWyckoff },
                  { key: 'signals', label: '量化信号' },
                  { key: 'news', label: t.app.tabTrending },
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
                      {/* 结论摘要条 */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                        padding: '9px 12px', borderRadius: 10,
                        background: displayResult.scoring.direction === 'long' ? 'rgba(5,150,105,0.08)' : displayResult.scoring.direction === 'short' ? 'rgba(220,38,38,0.08)' : 'rgba(148,163,184,0.08)',
                        border: `1px solid ${displayResult.scoring.direction === 'long' ? 'rgba(5,150,105,0.25)' : displayResult.scoring.direction === 'short' ? 'rgba(220,38,38,0.25)' : 'rgba(148,163,184,0.25)'}`,
                      }}>
                        <span style={{ fontSize: 20 }}>
                          {displayResult.scoring.direction === 'long' ? '🟢' : displayResult.scoring.direction === 'short' ? '🔴' : '⚪'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: displayResult.scoring.direction === 'long' ? '#059669' : displayResult.scoring.direction === 'short' ? '#dc2626' : '#94a3b8' }}>
                            {displayResult.scoring.direction === 'long' ? '看多' : displayResult.scoring.direction === 'short' ? '看空' : '中性观望'}
                            <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: 13 }}>
                              {displayResult.scoring.probability}%
                            </span>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                            {displayResult.wyckoff.phase === 'accumulation' ? '吸筹阶段' : displayResult.wyckoff.phase === 'markup' ? '上涨阶段' : displayResult.wyckoff.phase === 'distribution' ? '派发阶段' : '下跌阶段'}
                            {' · '}评分 {displayResult.scoring.score > 0 ? '+' : ''}{typeof displayResult.scoring.score === 'number' ? displayResult.scoring.score.toFixed(2) : displayResult.scoring.score}
                          </div>
                        </div>
                      </div>
                      <ReportPanel result={{ ...displayResult, news: [] }} activeTimeframe={activeTimeframe} />
                    </div>
                  ) : (
                    <EmptyPanelGuide onAnalyze={() => handleAnalyze()} />
                  )
                )}
                {rightTab === 'wyckoff' && (
                  displayResult ? (
                    <WyckoffPane result={displayResult} klines={displayResult ? chartKlines : []} />
                  ) : (
                    <EmptyPanelGuide onAnalyze={() => handleAnalyze()} />
                  )
                )}
                {rightTab === 'signals' && (
                  displayResult ? (
                    <SignalsPane result={displayResult} />
                  ) : (
                    <EmptyPanelGuide onAnalyze={() => handleAnalyze()} />
                  )
                )}
                {rightTab === 'news' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14 }}>
                    {displayResult && (
                      <SentimentPanel sentiment={displayResult.sentiment} socialHeat={displayResult.socialHeat} />
                    )}
                    <TrendingPanel />
                  </div>
                )}
              </div>
            </div>
            )} {/* end !isMobile right panel */}
          </div>

          {/* ── 手机端主内容区（始终显示，tab 切换） ── */}
          {isMobile && (
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
              {mobileTab === 'indicators' && (
                <div style={{ padding: '12px 12px 72px' }}>
                  {displayResult ? (
                    <>
                      {/* 简要价格信息 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{displaySymbol}</span>
                        {price > 0 && (
                          <>
                            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--t1)', fontFamily: 'monospace' }}>${formatPrice(price, symbol)}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: isPos ? 'var(--green)' : 'var(--red)' }}>
                              {isPos ? '+' : ''}{formatPercent(Math.abs(priceChange))}
                            </span>
                          </>
                        )}
                      </div>
                      {/* 技术指标 */}
                      <IndicatorPanel indicators={displayResult.primaryIndicators} symbol={symbol} />
                    </>
                  ) : (
                    <EmptyPanelGuide onAnalyze={() => handleAnalyze()} />
                  )}
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
            { key: 'report', icon: '🤖', label: t.app.mobileTabReport },
            { key: 'wyckoff', icon: '🦞', label: t.app.mobileTabWyckoff },
            { key: 'indicators', icon: '📊', label: t.app.mobileTabIndicators },
          ] as { key: MobileTab; icon: string; label: string }[]).map(tab => (
            <button
              key={tab.key}
              className={`mobile-tab-item${mobileTab === tab.key ? ' active' : ''}`}
              onClick={() => setMobileTab(tab.key)}
            >
              <span style={{ fontSize: 18 }}>{tab.icon}</span>
              <span>{tab.label}</span>
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
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18, color: 'var(--t1)' }}>{t.appPage.feedbackTitle}</div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 8 }}>{t.appPage.feedbackTypeLabel}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {([['bug', t.appPage.feedbackBug], ['feature', t.appPage.feedbackFeature], ['complaint', t.appPage.feedbackComplaint], ['other', t.appPage.feedbackOther]] as const).map(([k, label]) => (
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
              <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 8 }}>{t.appPage.feedbackContentLabel}</div>
              <textarea
                value={feedbackContent}
                onChange={e => setFeedbackContent(e.target.value)}
                placeholder={t.appPage.feedbackPlaceholder}
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
                    showToast(t.appPage.feedbackSuccess);
                    setFeedbackContent('');
                    setShowFeedbackModal(false);
                  } else {
                    showToast(t.appPage.feedbackFailed);
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
            >{feedbackSubmitting ? t.appPage.feedbackSubmittingBtn : t.appPage.feedbackSubmitBtn}</button>
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
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: 'var(--t1)' }}>{t.appPage.onboardingTitle}</h2>
            <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7, marginBottom: 28 }}>
              {t.appPage.onboardingSubtitle}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
              {[
                { step: 1, icon: '🪙', title: t.appPage.onboardingStep1Title, desc: t.appPage.onboardingStep1Desc },
                { step: 2, icon: '⏱', title: t.appPage.onboardingStep2Title, desc: t.appPage.onboardingStep2Desc },
                { step: 3, icon: '🤖', title: t.appPage.onboardingStep3Title, desc: t.appPage.onboardingStep3Desc },
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
              {t.appPage.onboardingStartBtn}
            </button>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 12 }}>{t.appPage.onboardingDismiss}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// 量化信号面板
function SignalsPane({ result }: { result: any }) {
  const scoring = result.scoring;
  const sentiment = result.sentiment;
  const indicators = result.indicators;
  const volumeProfile = result.volumeProfile ?? [];

  // 支撑阻力：从 volumeProfile 取 POC 和低成交量节点
  const poc = volumeProfile.find((n: any) => n.isPOC);
  const lvn = volumeProfile.filter((n: any) => n.isLowVolume).slice(0, 2);

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* 多周期打分明细 */}
      {scoring?.breakdown && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>⚡ 多周期共振打分</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {scoring.breakdown.map((b: any) => {
              const isPos = b.weighted >= 0;
              const color = isPos ? '#059669' : '#dc2626';
              const pct = Math.min(100, Math.abs(b.weighted) / 5 * 100);
              return (
                <div key={b.timeframe}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: 'var(--t2)' }}>{b.label}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: 'var(--t4)' }}>权重 {(b.weight * 100).toFixed(0)}%</span>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color }}>
                        {b.score > 0 ? '+' : ''}{typeof b.score === 'number' ? b.score.toFixed(1) : b.score}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: color, transition: 'width 0.7s' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>综合得分</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: scoring.score > 0 ? '#059669' : scoring.score < 0 ? '#dc2626' : '#94a3b8' }}>
              {scoring.score > 0 ? '+' : ''}{typeof scoring.score === 'number' ? scoring.score.toFixed(2) : scoring.score}
            </span>
          </div>
        </div>
      )}

      {/* 多周期技术状态 */}
      {indicators && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>📈 多周期指标概览</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {(['1d', '4h', '1h', '15m'] as const).map(tf => {
              const ind = indicators[tf];
              if (!ind) return null;
              const rsiColor = ind.rsi > 70 ? '#dc2626' : ind.rsi < 30 ? '#059669' : '#94a3b8';
              const macdColor = ind.macdState === 'golden' ? '#059669' : ind.macdState === 'dead' ? '#dc2626' : '#94a3b8';
              const tfLabel: Record<string, string> = { '1d': '日线', '4h': '4H', '1h': '1H', '15m': '15m' };
              return (
                <div key={tf} style={{
                  padding: '8px 10px', borderRadius: 8,
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 4, fontWeight: 600 }}>{tfLabel[tf]}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--t4)' }}>RSI</span>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: rsiColor }}>{ind.rsi?.toFixed(0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: 'var(--t4)' }}>MACD</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: macdColor }}>
                      {ind.macdState === 'golden' ? '金叉' : ind.macdState === 'dead' ? '死叉' : '中性'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* POC & 支撑阻力 */}
      {(poc || lvn.length > 0) && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>🎯 支撑 / 阻力区间</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {poc && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 7, background: 'rgba(240,180,41,0.08)', border: '1px solid rgba(240,180,41,0.25)' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)' }}>POC 控制价</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>成交量最密集区域</div>
                </div>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>
                  ${poc.priceMid?.toFixed(2)}
                </span>
              </div>
            )}
            {lvn.map((node: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>低成交量节点 {i + 1}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>快速穿越区，支撑/阻力较弱</div>
                </div>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--t2)', fontSize: 12 }}>
                  ${node.priceMid?.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 情绪指标摘要 */}
      {sentiment && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>🌡️ 情绪指标</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--t4)', marginBottom: 3 }}>恐慌贪婪</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 18, color: sentiment.fearGreed > 70 ? '#dc2626' : sentiment.fearGreed < 30 ? '#059669' : '#d97706' }}>
                {sentiment.fearGreed}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{sentiment.fearGreedLabel}</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--t4)', marginBottom: 3 }}>资金费率</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16, color: Math.abs(sentiment.fundingRate) > 0.001 ? '#d97706' : 'var(--t2)' }}>
                {(sentiment.fundingRate * 100).toFixed(3)}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                {sentiment.fundingRate > 0.001 ? '多头过热' : sentiment.fundingRate < -0.0005 ? '空头过热' : '费率平衡'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 信号标签 */}
      {scoring?.signals && scoring.signals.length > 0 && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>🚦 触发信号</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {scoring.signals.map((sig: string, i: number) => (
              <span key={i} style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: 'rgba(240,180,41,0.1)', color: 'var(--primary)',
                border: '1px solid rgba(240,180,41,0.3)',
              }}>{sig}</span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
function EmptyPanelGuide({ onAnalyze }: { onAnalyze: () => void }) {
  const t = useT();
  return (
    <div style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 40 }}>🤖</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{t.appPage.emptyWaiting}</div>
      <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>{t.appPage.emptyHint.split('\n').map((line, i) => <span key={i}>{line}{i === 0 ? <br /> : null}</span>)}</div>
      <button onClick={onAnalyze} style={{
        marginTop: 8, padding: '8px 20px', borderRadius: 8,
        background: 'linear-gradient(135deg, #f0b429, #e8920a)',
        color: '#000', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
      }}>{t.appPage.emptyAnalyzeBtn}</button>
    </div>
  );
}

// 威科夫分析面板
function WyckoffPane({ result, klines }: { result: any; klines: any[] }) {
  const t = useT();
  const phaseMap: Record<string, { label: string; color: string; bg: string; desc: string }> = {
    accumulation: { label: t.wyckoff.phaseAccumulation, color: '#059669', bg: 'rgba(5,150,105,0.08)', desc: t.wyckoff.phaseAccumulationDesc },
    markup:       { label: t.wyckoff.phaseMarkup,       color: '#2563eb', bg: 'rgba(37,99,235,0.08)', desc: t.wyckoff.phaseMarkupDesc },
    distribution: { label: t.wyckoff.phaseDistribution, color: '#d97706', bg: 'rgba(217,119,6,0.08)', desc: t.wyckoff.phaseDistributionDesc },
    markdown:     { label: t.wyckoff.phaseMarkdown,     color: '#dc2626', bg: 'rgba(220,38,38,0.08)', desc: t.wyckoff.phaseMarkdownDesc },
  };
  const patternMap: Record<string, { label: string; color: string; desc: string }> = {
    spring:   { label: t.wyckoff.patternSpring,    color: '#059669', desc: t.wyckoff.patternSpringDesc },
    upthrust: { label: t.wyckoff.patternUpthrust,  color: '#dc2626', desc: t.wyckoff.patternUpthrustDesc },
    sos:      { label: t.wyckoff.patternSos,       color: '#2563eb', desc: t.wyckoff.patternSosDesc },
    sow:      { label: t.wyckoff.patternSow,       color: '#d97706', desc: t.wyckoff.patternSowDesc },
    none:     { label: t.wyckoff.patternNone,      color: '#94a3b8', desc: t.wyckoff.patternNoneDesc },
  };

  const phase   = result.wyckoff?.phase   ?? 'accumulation';
  const pattern = result.wyckoff?.pattern ?? 'none';
  const phaseConf  = result.wyckoff?.phaseConfidence ?? 0;
  const patternConf = result.wyckoff?.patternConfidence ?? 0;
  const phaseInfo   = phaseMap[phase]   ?? phaseMap.accumulation;
  const patternInfo = patternMap[pattern] ?? patternMap.none;

  const ce = result.wyckoff?.causeAndEffect;
  const tfs: Array<{ key: string; label: string }> = [
    { key: '1d', label: t.wyckoff.tfDay },
    { key: '4h', label: t.wyckoff.tf4h },
    { key: '1h', label: t.wyckoff.tf1h },
    { key: '15m', label: t.wyckoff.tf15m },
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
          }}>{t.wyckoff.confidence} {typeof phaseConf === 'number' ? phaseConf.toFixed(2) : phaseConf}%</span>
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
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>{t.wyckoff.confidence} {typeof patternConf === 'number' ? patternConf.toFixed(2) : patternConf}%</span>
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
          <div style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', marginBottom: 5 }}>{t.wyckoff.compositeMan}</div>
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
              <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>{t.wyckoff.divergenceWarn}</span>
            </div>
          )}
        </div>
      )}

      {/* 量价验证（非背离时展示） */}
      {result.wyckoff?.volumeVerification && result.wyckoff.volumeVerification !== 'divergence' && (() => {
        const vv = result.wyckoff.volumeVerification;
        const vMap: Record<string, { icon: string; label: string; color: string }> = {
          bullish:    { icon: '✅', label: t.wyckoff.volumeBullish,    color: '#059669' },
          bearish:    { icon: '⚠️', label: t.wyckoff.volumeBearish,    color: '#dc2626' },
          divergence: { icon: '⚠️', label: t.wyckoff.volumeDivergence, color: '#d97706' },
          neutral:    { icon: '—',  label: t.wyckoff.volumeNeutral,    color: '#94a3b8' },
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
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{t.wyckoff.volumeVerification}</div>
            </div>
          </div>
        );
      })()}

      {/* 因果法则：只保留区间幅度，目标价已在 AI策略报告 止盈区展示 */}
      {ce && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 13px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)' }}>{t.wyckoff.causeEffect}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>
              ±${ce.accumulationRange?.toFixed(0) ?? '-'}
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--t3)', margin: '4px 0 0', lineHeight: 1.5 }}>
            {t.wyckoff.causeEffectSub}
          </p>
        </div>
      )}

      {/* 多周期共振 */}
      {result.indicators && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 7 }}>{t.wyckoff.multiTfRSI}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {tfs.map(({ key, label }) => {
              const ind = result.indicators[key];
              if (!ind) return null;
              const bullish = ind.rsi > 50 && ind.macdState?.includes('看涨');
              const bearish = ind.rsi < 50 && ind.macdState?.includes('看跌');
              const color = bullish ? '#059669' : bearish ? '#dc2626' : '#d97706';
              const signal = bullish ? t.wyckoff.bullish : bearish ? t.wyckoff.bearish : t.wyckoff.neutral;
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
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 7 }}>{t.wyckoff.fiveDim}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              { key: 'wyckoff',   label: t.wyckoff.dimWyckoff,    icon: '🔭', score: result.scoring.dims.wyckoff,   color: '#2563eb' },
              { key: 'volume',    label: t.wyckoff.dimVolume,     icon: '📦', score: result.scoring.dims.volume,    color: '#059669' },
              { key: 'momentum',  label: t.wyckoff.dimMomentum,   icon: '⚡', score: result.scoring.dims.momentum,  color: '#7c3aed' },
              { key: 'sentiment', label: t.wyckoff.dimSentiment,  icon: '📰', score: result.scoring.dims.sentiment, color: '#d97706' },
              { key: 'orderbook', label: t.wyckoff.dimOrderbook,  icon: '📋', score: result.scoring.dims.orderbook, color: '#0ea5e9' },
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

      {/* VSA 量价信号 */}
      {klines && klines.length >= 20 && (
        <VSASignalPanel klines={klines} />
      )}

    </div>
  );
}
