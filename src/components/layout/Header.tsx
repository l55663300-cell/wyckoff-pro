import React from 'react';
import { RefreshCw, Activity, Bell } from 'lucide-react';
import { Timeframe } from '../../types';
import { formatPrice, formatPercent } from '../../utils/formatters';
import { RefreshCountdown } from '../RefreshCountdown';
import { useT, getLang } from '../../i18n';

const TIMEFRAMES: { key: Timeframe; label: string; desc: string }[] = [
  { key: '1d', label: '日线', desc: '中线' },
  { key: '4h', label: '4H',  desc: '短线' },
  { key: '1h', label: '1H',  desc: '超短' },
  { key: '15m', label: '15m', desc: '超短' },
];

const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000;

interface HeaderProps {
  symbol: string;
  activeTimeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  price: number;
  priceChange24h: number;
  loading: boolean;
  onAnalyze: () => void;
  lastUpdated: number | null;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  alertEnabled: boolean;
  onOpenAlert: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  symbol, activeTimeframe, onTimeframeChange,
  price, priceChange24h, loading, onAnalyze, lastUpdated,
  autoRefresh, onToggleAutoRefresh, alertEnabled, onOpenAlert,
}) => {
  const t = useT();
  const isPositive = priceChange24h >= 0;
  const locale = getLang() === 'en' ? 'en-US' : 'zh-CN';

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center px-4 gap-3"
      style={{
        height: 52,
        background: 'rgba(8,11,20,0.97)',
        backdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* 当前标的 + 价格（left padding for sidebar） */}
      <div className="flex items-baseline gap-2 shrink-0" style={{ paddingLeft: 200 }}>
        <span className="font-bold text-sm" style={{ color: '#5C6478' }}>{symbol}</span>
        {price > 0 && (
          <>
            <span className="font-mono font-bold text-white" style={{ fontSize: 18, letterSpacing: '-0.03em' }}>
              ${formatPrice(price, symbol)}
            </span>
            <span
              className="text-xs font-semibold px-1.5 py-0.5 rounded-lg"
              style={{
                background: isPositive ? 'rgba(0,212,170,0.12)' : 'rgba(246,70,93,0.12)',
                color: isPositive ? '#00D4AA' : '#F6465D',
              }}
            >
              {isPositive ? '▲' : '▼'} {formatPercent(Math.abs(priceChange24h))}
            </span>
          </>
        )}
      </div>

      {/* 分隔 */}
      <div className="w-px h-5 shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }} />

      {/* 周期切换 */}
      <div
        className="flex items-center gap-0.5 p-0.5 rounded-xl shrink-0"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.key}
            onClick={() => onTimeframeChange(tf.key)}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            style={
              activeTimeframe === tf.key
                ? { background: 'rgba(240,185,11,0.2)', color: '#F0B90B', border: '1px solid rgba(240,185,11,0.3)' }
                : { color: '#5C6478' }
            }
          >
            {tf.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* 倒计时 */}
      <RefreshCountdown intervalMs={AUTO_REFRESH_INTERVAL} enabled={autoRefresh} onRefresh={onAnalyze} />

      {/* 状态点 */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: loading ? '#F0B90B' : lastUpdated ? '#00D4AA' : '#3C4255',
            animation: loading ? 'badge-pulse 1s infinite' : 'badge-pulse 3s infinite',
          }}
        />
        <span style={{ color: '#5C6478', fontSize: 11 }}>
          {loading ? t.header.analyzing : lastUpdated
            ? new Date(lastUpdated).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) + ' ' + t.header.updated
            : t.header.notAnalyzed}
        </span>
      </div>

      {/* 自动刷新 */}
      <button
        onClick={onToggleAutoRefresh}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
        style={
          autoRefresh
            ? { background: 'rgba(0,212,170,0.15)', color: '#00D4AA', border: '1px solid rgba(0,212,170,0.3)' }
            : { background: 'rgba(255,255,255,0.04)', color: '#5C6478', border: '1px solid rgba(255,255,255,0.06)' }
        }
      >
        <Activity size={12} />
        <span>{autoRefresh ? t.header.auto : t.header.manual}</span>
      </button>

      {/* 微信推送 */}
      <button
        onClick={onOpenAlert}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
        style={
          alertEnabled
            ? { background: 'rgba(0,200,150,0.15)', color: '#00C896', border: '1px solid rgba(0,200,150,0.3)' }
            : { background: 'rgba(255,255,255,0.04)', color: '#5C6478', border: '1px solid rgba(255,255,255,0.06)' }
        }
      >
        <Bell size={12} />
        <span>{t.header.push}</span>
        {alertEnabled && <span className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ animation: 'badge-pulse 2s infinite' }} />}
      </button>

      {/* 分析按钮 */}
      <button
        onClick={onAnalyze}
        disabled={loading}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        style={
          loading
            ? { background: 'rgba(30,37,53,0.8)', color: '#5C6478', border: '1px solid rgba(255,255,255,0.06)' }
            : { background: 'linear-gradient(135deg,#00D4AA,#00B896)', color: '#000', boxShadow: '0 4px 20px rgba(0,212,170,0.35)' }
        }
      >
        <RefreshCw size={13} className={loading ? 'spin-slow' : ''} />
        {loading ? t.header.analyzing : t.header.analyzeBtn}
      </button>
    </header>
  );
};
