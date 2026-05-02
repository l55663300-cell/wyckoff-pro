import React, { useEffect, useRef, useState, memo } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  ISeriesApi,
  SeriesType,
} from 'lightweight-charts';
import { KLine } from '../../types';

interface CandlestickChartProps {
  klines: KLine[];
  height?: number;
  symbol?: string;
  timeframe?: string;
}

interface OHLCInfo {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
  x: number;
  y: number;
}

function formatVal(v: number): string {
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  return v.toFixed(6);
}

export const CandlestickChart: React.FC<CandlestickChartProps> = memo(({ klines, height = 400, symbol, timeframe }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const [ohlc, setOhlc] = useState<OHLCInfo | null>(null);

  // 构建TV URL
  const getTvUrl = () => {
    const sym = symbol ?? 'ETHUSDT';
    const tfMap: Record<string, string> = { '1d':'1D','4h':'240','1h':'60','15m':'15' };
    const tvSym = encodeURIComponent('BINANCE:' + sym);
    const tf = tfMap[timeframe ?? '1h'] ?? '60';
    return `https://www.tradingview.com/widgetembed/?frameElementId=tvChart&symbol=${tvSym}&interval=${tf}&theme=dark&style=1&locale=zh_CN&timezone=Asia%2FShanghai&allow_symbol_change=1&hidesidetoolbar=0&hidetoptoolbar=0&saveimage=1&withdateranges=1`;
  };

  // 初始化图表
  useEffect(() => {
    if (!containerRef.current || klines.length === 0) return;
    const container = containerRef.current;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#64748b',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#f1f5f9' },
        horzLines: { color: '#f1f5f9' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#2563eb40', width: 1, style: 3 },
        horzLine: { color: '#2563eb40', width: 1, style: 3 },
      },
      rightPriceScale: { borderColor: '#e2e8f0' },
      timeScale: { borderColor: '#e2e8f0', timeVisible: true, secondsVisible: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26A69A', downColor: '#EF5350',
      borderUpColor: '#26A69A', borderDownColor: '#EF5350',
      wickUpColor: '#26A69A', wickDownColor: '#EF5350',
    });
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    const candleData = klines.map((k) => ({
      time: Math.floor(k.openTime / 1000) as import('lightweight-charts').Time,
      open: k.open, high: k.high, low: k.low, close: k.close,
    }));
    const volData = klines.map((k) => ({
      time: Math.floor(k.openTime / 1000) as import('lightweight-charts').Time,
      value: k.volume,
      color: k.close >= k.open ? 'rgba(38,166,154,0.35)' : 'rgba(239,83,80,0.35)',
    }));
    candleSeries.setData(candleData);
    volSeries.setData(volData);
    chart.timeScale().fitContent();

    candleSeriesRef.current = candleSeries;
    chartRef.current = chart;

    // 十字光标移动：显示 OHLC
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point || !param.seriesData) {
        setOhlc(null);
        return;
      }
      const data = param.seriesData.get(candleSeries) as { open: number; high: number; low: number; close: number } | undefined;
      if (!data) { setOhlc(null); return; }

      // 找到对应 kline 的 volume
      const ts = param.time as number;
      const kline = klines.find(k => Math.floor(k.openTime / 1000) === ts);

      setOhlc({
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: kline?.volume ?? 0,
        time: ts,
        x: param.point.x,
        y: param.point.y,
      });
    });

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(handleResize, 16);
    };
    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      if (resizeTimer) clearTimeout(resizeTimer);
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [klines, height]);

  const isUp = ohlc ? ohlc.close >= ohlc.open : true;
  const ohlcColor = isUp ? '#26A69A' : '#EF5350';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* OHLC 悬浮信息条（固定在图表左上角） */}
      {ohlc && (
        <div style={{
          position: 'absolute', top: 8, left: 10, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(4px)',
          border: '1px solid #e2e8f0', borderRadius: 8,
          padding: '4px 12px', fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <span style={{ color: '#64748b', fontFamily: 'inherit', fontSize: 10 }}>
            {new Date(ohlc.time * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
          </span>
          <span style={{ color: '#64748b' }}>开 <span style={{ color: ohlcColor, fontWeight: 600 }}>{formatVal(ohlc.open)}</span></span>
          <span style={{ color: '#64748b' }}>高 <span style={{ color: '#26A69A', fontWeight: 600 }}>{formatVal(ohlc.high)}</span></span>
          <span style={{ color: '#64748b' }}>低 <span style={{ color: '#EF5350', fontWeight: 600 }}>{formatVal(ohlc.low)}</span></span>
          <span style={{ color: '#64748b' }}>收 <span style={{ color: ohlcColor, fontWeight: 700 }}>{formatVal(ohlc.close)}</span></span>
          <span style={{ color: '#94a3b8', fontSize: 10 }}>量 {ohlc.volume >= 1000 ? (ohlc.volume / 1000).toFixed(1) + 'K' : ohlc.volume.toFixed(0)}</span>
        </div>
      )}

      {/* 图表区 */}
      <div
        ref={containerRef}
        style={{ flex: 1, width: '100%', minHeight: 0 }}
      />
    </div>
  );
});

CandlestickChart.displayName = 'CandlestickChart';
