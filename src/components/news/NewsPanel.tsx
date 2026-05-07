import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { NewsItem } from '../../types';
import { fetchNewsWithSentiment, analyzeNewsSentiment, NewsSentimentResult, CategorizedNewsItem } from '../../api/newsApi';
import { useT, getLang } from '../../i18n';

interface NewsPanelProps {
  news?: CategorizedNewsItem[];
  allNews?: CategorizedNewsItem[];
  autoFetch?: boolean;
}

const VERDICT_STYLE: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  bullish: { color: '#059669', bg: '#ecfdf5', border: '#86efac', icon: '📈' },
  bearish: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '📉' },
  neutral: { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: '➖' },
};

const EMPTY_SENTIMENT: NewsSentimentResult = {
  bullish: 0, bearish: 0, neutral: 0,
  bullScore: 0, bearScore: 0,
  verdict: 'neutral', verdictLabel: '中性',
  verdictDesc: '暂无消息面数据',
  totalAnalyzed: 0,
};

/** 手动刷新冷却时间：60秒 */
const MANUAL_COOLDOWN_MS = 60 * 1000;

export const NewsPanel: React.FC<NewsPanelProps> = ({ news: propNews, allNews: propAllNews, autoFetch = true }) => {
  const t = useT();
  const [displayNews, setDisplayNews] = useState<CategorizedNewsItem[]>((propNews as CategorizedNewsItem[]) ?? []);
  const [sentiment, setSentiment] = useState<NewsSentimentResult>(EMPTY_SENTIMENT);
  const [fetching, setFetching] = useState(false);
  // 手动刷新冷却：剩余秒数，0 = 可刷新
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 记录最后一次刷新时间
  const lastFetchRef = useRef<number>(0);

  const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
    macro:      { label: t.news.catMacro,      color: '#7c3aed', bg: '#f5f3ff' },
    blockchain: { label: t.news.catBlockchain, color: '#0369a1', bg: '#f0f9ff' },
    crypto:     { label: t.news.catCrypto,     color: '#d97706', bg: '#fffbeb' },
  };

  const doFetch = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetchNewsWithSentiment();
      setDisplayNews(res.displayNews);
      setSentiment(analyzeNewsSentiment(res.allNews));
      lastFetchRef.current = Date.now();
    } catch {
      // 静默失败，不影响展示
    } finally {
      setFetching(false);
    }
  }, []);

  // 启动冷却倒计时
  const startCooldown = useCallback(() => {
    setCooldown(Math.ceil(MANUAL_COOLDOWN_MS / 1000));
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // 手动刷新
  const handleManualRefresh = useCallback(() => {
    if (cooldown > 0 || fetching) return;
    doFetch();
    startCooldown();
  }, [cooldown, fetching, doFetch, startCooldown]);

  useEffect(() => {
    if (propNews !== undefined) {
      setDisplayNews(propNews as CategorizedNewsItem[]);
      const forAnalysis = (propAllNews && propAllNews.length > 0 ? propAllNews : propNews) as NewsItem[];
      setSentiment(analyzeNewsSentiment(forAnalysis));
      return;
    }
    if (!autoFetch) return;

    doFetch();
    const interval = setInterval(doFetch, 30 * 60 * 1000);
    return () => {
      clearInterval(interval);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, [propNews, propAllNews, autoFetch, doFetch]);

  const vs = VERDICT_STYLE[sentiment.verdict];
  const total = sentiment.bullish + sentiment.bearish + sentiment.neutral || 1;
  const locale = getLang() === 'en' ? 'en-US' : 'zh-CN';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 14px 0', flexShrink: 0,
      }}>
        <div className="card-title" style={{ flex: 1, fontSize: 13 }}>{t.news.title}</div>

        {/* 手动刷新按钮 */}
        <button
          onClick={handleManualRefresh}
          disabled={cooldown > 0 || fetching}
          title={cooldown > 0 ? t.news.cooldownHint(cooldown) : t.news.refreshTitle}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 6, fontSize: 11,
            border: '1px solid var(--border)',
            background: cooldown > 0 ? 'var(--bg3)' : 'transparent',
            color: cooldown > 0 ? 'var(--t4)' : 'var(--t2)',
            cursor: cooldown > 0 || fetching ? 'not-allowed' : 'pointer',
            transition: 'all .15s',
          }}
        >
          <RefreshCw size={10} className={fetching ? 'spin-slow' : ''} />
          {cooldown > 0 ? `${cooldown}s` : t.news.refresh}
        </button>

        <span style={{ fontSize: 10, color: 'var(--t4)' }}>{t.news.autoRefresh}</span>
      </div>

      {/* 舆情综合结论 */}
      <div style={{ flexShrink: 0, padding: '10px 10px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 10,
          background: vs.bg, border: `1.5px solid ${vs.border}`,
        }}>
          <span style={{ fontSize: 20 }}>{vs.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: vs.color, lineHeight: 1 }}>{sentiment.verdictLabel}</div>
            <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 3, lineHeight: 1.45 }}>{sentiment.verdictDesc}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, fontSize: 16, color: vs.color, lineHeight: 1 }}>
              {sentiment.bullScore > sentiment.bearScore ? `+${sentiment.bullScore - sentiment.bearScore}` : sentiment.bullScore - sentiment.bearScore}
            </div>
            <div style={{ fontSize: 9, color: 'var(--t4)', marginTop: 2 }}>{t.news.weightedDiff}</div>
          </div>
        </div>

        {/* 多/空/中性数量 */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <div style={{ flex: 1, padding: '5px 8px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#059669', fontFamily: 'monospace' }}>{sentiment.bullish}</div>
            <div style={{ fontSize: 9, color: '#059669' }}>{t.news.bullish}</div>
          </div>
          <div style={{ flex: 1, padding: '5px 8px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', fontFamily: 'monospace' }}>{sentiment.neutral}</div>
            <div style={{ fontSize: 9, color: '#94a3b8' }}>{t.news.neutral}</div>
          </div>
          <div style={{ flex: 1, padding: '5px 8px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fca5a5', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', fontFamily: 'monospace' }}>{sentiment.bearish}</div>
            <div style={{ fontSize: 9, color: '#dc2626' }}>{t.news.bearish}</div>
          </div>
        </div>

        {/* 情绪比例进度条 */}
        {displayNews.length > 0 && (
          <div style={{ display: 'flex', height: 3, margin: '8px 0 0', overflow: 'hidden', borderRadius: 2 }}>
            <div style={{ width: `${(sentiment.bullish / total) * 100}%`, background: '#059669', transition: 'width 0.6s' }} />
            <div style={{ width: `${(sentiment.neutral / total) * 100}%`, background: '#cbd5e1', transition: 'width 0.6s' }} />
            <div style={{ width: `${(sentiment.bearish / total) * 100}%`, background: '#dc2626', transition: 'width 0.6s' }} />
          </div>
        )}

        {/* 分隔标题 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 2px 0' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)' }}>{t.news.featured}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['macro', 'blockchain', 'crypto'] as const).map(cat => {
              const m = CATEGORY_META[cat];
              return (
                <span key={cat} style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 10,
                  background: m.bg, color: m.color, fontWeight: 600,
                }}>{m.label}</span>
              );
            })}
          </div>
        </div>
      </div>

      {/* 新闻列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
        {fetching && displayNews.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 54, borderRadius: 10 }} />
          ))
        ) : displayNews.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📡</div>
            {t.news.empty}
            <br />
            <button
              onClick={handleManualRefresh}
              disabled={cooldown > 0 || fetching}
              style={{
                marginTop: 10, padding: '6px 16px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--primary)', fontSize: 12, cursor: 'pointer',
              }}
            >{t.news.clickRefresh}</button>
          </div>
        ) : (
          displayNews.slice(0, 6).map((item, i) => {
            const text = (item.titleZh ?? item.title).toLowerCase() + item.title.toLowerCase();
            const isBull = ['上涨','突破','利好','暴涨','大涨','新高','净流入','反弹','surge','rally','record','inflow','approve','rise','gain'].some(k => text.includes(k));
            const isBear = ['下跌','崩盘','暴跌','清算','爆仓','禁止','监管','crash','drop','ban','hack','liquidat','outflow','plunge','fall'].some(k => text.includes(k));
            const dotColor = isBull && !isBear ? '#059669' : isBear && !isBull ? '#dc2626' : '#94a3b8';
            const cat = item.category ?? 'crypto';
            const catMeta = CATEGORY_META[cat] ?? CATEGORY_META.crypto;

            return (
              <a
                key={i}
                href={item.link && item.link !== '#' ? item.link : undefined}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '8px 10px', borderRadius: 10,
                  background: 'var(--bg-subtle)', border: '1px solid var(--bd-light)',
                  textDecoration: 'none', transition: 'all 0.15s',
                  cursor: item.link && item.link !== '#' ? 'pointer' : 'default',
                  flexShrink: 0,
                }}
                onMouseEnter={e => {
                  if (item.link && item.link !== '#') {
                    e.currentTarget.style.background = '#fff';
                    e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--bg-subtle)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: dotColor, flexShrink: 0, marginTop: 5,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--t1)', margin: 0, marginBottom: 3 }}>
                    {item.titleZh && item.titleZh !== item.title ? item.titleZh : item.title}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 8,
                      background: catMeta.bg, color: catMeta.color,
                      fontWeight: 600, border: `1px solid ${catMeta.color}33`,
                    }}>{catMeta.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--t3)' }}>{item.source}</span>
                    {item.pubDate && (
                      <span style={{ fontSize: 10, color: 'var(--t4)' }}>
                        {new Date(item.pubDate).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
                {item.link && item.link !== '#' && (
                  <ExternalLink size={10} style={{ color: 'var(--t4)', flexShrink: 0, marginTop: 3 }} />
                )}
              </a>
            );
          })
        )}
      </div>
    </div>
  );
};
