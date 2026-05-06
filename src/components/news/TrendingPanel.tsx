import React, { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchTrending, TrendingCoin, TrendingSentiment, TrendingResult } from '../../api/trendingApi';

const VERDICT_STYLE: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  bullish: { color: '#059669', bg: '#ecfdf5', border: '#86efac', icon: '🔥' },
  bearish: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '🧊' },
  neutral: { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: '〰️' },
};

const EMPTY_SENTIMENT: TrendingSentiment = {
  bullishCount: 0, bearishCount: 0, avgChange: 0,
  verdict: 'neutral', verdictLabel: '加载中',
  verdictDesc: '正在获取热搜数据...',
};

const MANUAL_COOLDOWN_MS = 60 * 1000;

function formatPrice(p: number | null): string {
  if (p == null) return '—';
  if (p >= 1000) return `$${p.toLocaleString('en', { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

export const TrendingPanel: React.FC = () => {
  const [coins, setCoins] = useState<TrendingCoin[]>([]);
  const [sentiment, setSentiment] = useState<TrendingSentiment>(EMPTY_SENTIMENT);
  const [fetching, setFetching] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyResult = (r: TrendingResult) => {
    setCoins(r.coins);
    setSentiment(r.sentiment);
    setUpdatedAt(r.updatedAt);
    setError('');
  };

  const doFetch = useCallback(async () => {
    setFetching(true);
    try {
      const r = await fetchTrending();
      applyResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取失败');
    } finally {
      setFetching(false);
    }
  }, []);

  const startCooldown = useCallback(() => {
    setCooldown(Math.ceil(MANUAL_COOLDOWN_MS / 1000));
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { if (cooldownRef.current) clearInterval(cooldownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleRefresh = useCallback(() => {
    if (cooldown > 0 || fetching) return;
    doFetch();
    startCooldown();
  }, [cooldown, fetching, doFetch, startCooldown]);

  useEffect(() => {
    doFetch();
    const timer = setInterval(doFetch, 10 * 60 * 1000); // 10分钟自动刷新
    return () => { clearInterval(timer); if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [doFetch]);

  const vs = VERDICT_STYLE[sentiment.verdict];

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 0', flexShrink: 0 }}>
        <div className="card-title" style={{ flex: 1, fontSize: 13 }}>🔥 社交热度 · 热搜榜</div>
        <button
          onClick={handleRefresh}
          disabled={cooldown > 0 || fetching}
          title={cooldown > 0 ? `${cooldown}s 后可刷新` : '刷新热搜数据'}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 6, fontSize: 11,
            border: '1px solid var(--border)',
            background: cooldown > 0 ? 'var(--bg3)' : 'transparent',
            color: cooldown > 0 ? 'var(--t4)' : 'var(--t2)',
            cursor: cooldown > 0 || fetching ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={10} className={fetching ? 'spin-slow' : ''} />
          {cooldown > 0 ? `${cooldown}s` : '刷新'}
        </button>
        <span style={{ fontSize: 10, color: 'var(--t4)' }}>10分钟自动刷新</span>
      </div>

      {/* 情绪结论 */}
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
            <div style={{
              fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, fontSize: 16,
              color: sentiment.avgChange >= 0 ? '#059669' : '#dc2626', lineHeight: 1,
            }}>
              {sentiment.avgChange >= 0 ? '+' : ''}{sentiment.avgChange.toFixed(1)}%
            </div>
            <div style={{ fontSize: 9, color: 'var(--t4)', marginTop: 2 }}>平均涨跌</div>
          </div>
        </div>

        {/* 多/空数量 */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <div style={{ flex: 1, padding: '5px 8px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#059669', fontFamily: 'monospace' }}>{sentiment.bullishCount}</div>
            <div style={{ fontSize: 9, color: '#059669' }}>上涨</div>
          </div>
          <div style={{ flex: 1, padding: '5px 8px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fca5a5', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', fontFamily: 'monospace' }}>{sentiment.bearishCount}</div>
            <div style={{ fontSize: 9, color: '#dc2626' }}>下跌</div>
          </div>
          <div style={{ flex: 1, padding: '5px 8px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', fontFamily: 'monospace' }}>
              {coins.filter(c => c.priceChangePercent24h === 0 || c.priceChangePercent24h == null).length}
            </div>
            <div style={{ fontSize: 9, color: 'var(--t3)' }}>持平</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 2px 0' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)' }}>24h 热搜榜 Top {coins.length}</span>
          {updatedAt && (
            <span style={{ fontSize: 10, color: 'var(--t4)' }}>
              更新于 {new Date(updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* 热搜列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px 10px', display: 'flex', flexDirection: 'column', gap: 5, minHeight: 0 }}>
        {fetching && coins.length === 0 ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 48, borderRadius: 10 }} />
          ))
        ) : error && coins.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>😵</div>
            获取失败：{error}
            <br />
            <button
              onClick={handleRefresh}
              style={{ marginTop: 10, padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--primary)', fontSize: 12, cursor: 'pointer' }}
            >重试</button>
          </div>
        ) : (
          coins.map((coin) => {
            const change = coin.priceChangePercent24h;
            const isUp = change != null && change > 0;
            const isDown = change != null && change < 0;
            const changeColor = isUp ? '#059669' : isDown ? '#dc2626' : 'var(--t3)';

            return (
              <div
                key={coin.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 10,
                  background: 'var(--bg-subtle)', border: '1px solid var(--bd-light)',
                  flexShrink: 0,
                }}
              >
                {/* 排名 */}
                <div style={{
                  width: 18, textAlign: 'center', fontSize: 11,
                  fontWeight: 700, color: coin.rank <= 3 ? '#f0b429' : 'var(--t4)',
                  flexShrink: 0,
                }}>
                  {coin.rank}
                </div>

                {/* logo */}
                <img
                  src={coin.thumb}
                  alt={coin.symbol}
                  width={24} height={24}
                  style={{ borderRadius: '50%', flexShrink: 0 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />

                {/* 名称 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.3 }}>
                    {coin.symbol}
                    {coin.marketCapRank && (
                      <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--t4)', fontWeight: 400 }}>
                        #{coin.marketCapRank}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', lineHeight: 1.2 }}>{coin.name}</div>
                </div>

                {/* 价格 & 涨跌 */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', fontFamily: 'monospace' }}>
                    {formatPrice(coin.priceUsd)}
                  </div>
                  {change != null ? (
                    <div style={{ fontSize: 10, fontWeight: 700, color: changeColor, fontFamily: 'monospace' }}>
                      {isUp ? '+' : ''}{change.toFixed(2)}%
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: 'var(--t4)' }}>—</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
