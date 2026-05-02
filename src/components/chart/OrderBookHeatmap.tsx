import React, { useEffect, useState, useMemo } from 'react';
import { fetchOrderBook, OrderBook, detectBigWalls } from '../../api/orderBookApi';
import { Symbol } from '../../types';
import { formatPrice } from '../../utils/formatters';

interface Props {
  symbol: Symbol;
  currentPrice: number;
}

export function OrderBookHeatmap({ symbol, currentPrice }: Props) {
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hoverBid, setHoverBid] = useState<number | null>(null);
  const [hoverAsk, setHoverAsk] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchOrderBook(symbol, 50);
        if (!cancelled) { setOrderBook(data); setLoading(false); setError(false); }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [symbol]);

  const walls = useMemo(() => {
    if (!orderBook) return { bidWalls: [], askWalls: [] };
    return detectBigWalls(orderBook, 2.0);
  }, [orderBook]);

  // 计算买卖压力总量
  const { topBid, topAsk, bidTotal, askTotal, bidBarPct, askBarPct } = useMemo(() => {
    if (!orderBook) return { topBid: null, topAsk: null, bidTotal: 0, askTotal: 0, bidBarPct: 50, askBarPct: 50 };
    const bids = orderBook.bids.slice(0, 10);
    const asks = orderBook.asks.slice(0, 10);
    const bidTotal = bids.reduce((a, b) => a + b.quantity, 0);
    const askTotal = asks.reduce((a, b) => a + b.quantity, 0);
    const total = bidTotal + askTotal || 1;
    // 最大单墙
    const topBid = walls.bidWalls[0] ?? (bids.sort((a, b) => b.quantity - a.quantity)[0] ?? null);
    const topAsk = walls.askWalls[0] ?? (asks.sort((a, b) => b.quantity - a.quantity)[0] ?? null);
    return {
      topBid,
      topAsk,
      bidTotal,
      askTotal,
      bidBarPct: Math.round((bidTotal / total) * 100),
      askBarPct: Math.round((askTotal / total) * 100),
    };
  }, [orderBook, walls]);

  const bidLabel = walls.bidWalls.length > 0 ? `${walls.bidWalls.length}强支撑` : '支撑';
  const askLabel = walls.askWalls.length > 0 ? `${walls.askWalls.length}强阻力` : '阻力';

  if (loading) return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--t1)' }}>订单簿热力图</span>
        <span style={{ fontSize: 10, color: 'var(--t4)' }}>加载中...</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="skeleton" style={{ height: 80, borderRadius: 10 }} />
        <div className="skeleton" style={{ height: 80, borderRadius: 10 }} />
      </div>
    </div>
  );

  if (error || !orderBook) return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t1)', marginBottom: 8 }}>订单簿热力图</div>
      <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--t3)', fontSize: 12 }}>
        ⚠️ 数据加载失败（仅支持合约品种）
      </div>
    </div>
  );

  return (
    <div className="card" style={{ padding: '12px 14px', height: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--t1)' }}>订单簿热力图</span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 20,
          background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0',
        }}>简化深度</span>
      </div>

      {/* 双列卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>

        {/* 买单墙（支撑） */}
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: '#f0fdf4', border: '1px solid #bbf7d0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: 12, color: '#15803d' }}>买单墙（支撑）</span>
          </div>
          {topBid ? (
            <>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13, color: '#15803d', marginBottom: 2 }}>
                ${formatPrice(topBid.price, symbol)} · {topBid.quantity >= 1000 ? (topBid.quantity / 1000).toFixed(1) + 'k' : topBid.quantity.toFixed(1)}
              </div>
              {/* 进度条 */}
              <div style={{ height: 6, background: '#dcfce7', borderRadius: 3, margin: '6px 0 4px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${bidBarPct}%`,
                  background: 'linear-gradient(90deg, #16a34a, #4ade80)',
                  transition: 'width 0.5s',
                }} />
              </div>
              {walls.bidWalls[1] && (
                <div style={{ fontSize: 10, color: '#16a34a' }}>
                  ${formatPrice(walls.bidWalls[1].price, symbol)} · {bidLabel}
                </div>
              )}
              {!walls.bidWalls[1] && topBid && (
                <div style={{ fontSize: 10, color: '#16a34a' }}>
                  ${formatPrice(topBid.price, symbol)} · {bidLabel}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>暂无大单</div>
          )}
        </div>

        {/* 卖单墙（阻力） */}
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: '#fff1f2', border: '1px solid #fecdd3',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: 12, color: '#b91c1c' }}>卖单墙（阻力）</span>
          </div>
          {topAsk ? (
            <>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13, color: '#b91c1c', marginBottom: 2 }}>
                ${formatPrice(topAsk.price, symbol)} · {topAsk.quantity >= 1000 ? (topAsk.quantity / 1000).toFixed(1) + 'k' : topAsk.quantity.toFixed(1)}
              </div>
              {/* 进度条 */}
              <div style={{ height: 6, background: '#fee2e2', borderRadius: 3, margin: '6px 0 4px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${askBarPct}%`,
                  background: 'linear-gradient(90deg, #f87171, #dc2626)',
                  transition: 'width 0.5s',
                }} />
              </div>
              {walls.askWalls[1] && (
                <div style={{ fontSize: 10, color: '#b91c1c' }}>
                  ${formatPrice(walls.askWalls[1].price, symbol)} · 卖压密集
                </div>
              )}
              {!walls.askWalls[1] && topAsk && (
                <div style={{ fontSize: 10, color: '#b91c1c' }}>
                  ${formatPrice(topAsk.price, symbol)} · {askLabel}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>暂无大单</div>
          )}
        </div>
      </div>

      {/* 买卖比例条 */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${bidBarPct}%`, background: '#16a34a', transition: 'width 0.5s' }} />
          <div style={{ flex: 1, background: '#dc2626' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>买压 {bidBarPct}%</span>
          <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>卖压 {askBarPct}%</span>
        </div>
      </div>

      {/* 底部提示 */}
      <div style={{ fontSize: 10, color: 'var(--t4)', textAlign: 'center', paddingTop: 4, borderTop: '1px solid var(--bd-light)' }}>
        鼠标悬浮查看具体价位 · 5s刷新
      </div>
    </div>
  );
}
