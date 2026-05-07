import React, { useState, useCallback, useRef } from 'react';
import { Symbol, DEFAULT_SYMBOLS } from '../../types';
import { useT } from '../../i18n';

const SYMBOL_META: Record<string, { icon: string; label: string }> = {
  ETHUSDT:  { icon: '💎', label: 'ETH' },
  BTCUSDT:  { icon: '₿',  label: 'BTC' },
  XAUTUSDT: { icon: '🥇', label: 'XAUT' },
  SOLUSDT:  { icon: '☀️', label: 'SOL' },
  BNBUSDT:  { icon: '🟡', label: 'BNB' },
  XRPUSDT:  { icon: '💧', label: 'XRP' },
};

function getSymbolMeta(sym: string) {
  return SYMBOL_META[sym] ?? { icon: '🪙', label: sym.replace('USDT', '') };
}

const LS_KEY = 'wyckoff_watchlist_v2';

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return [...DEFAULT_SYMBOLS];
}
function saveWatchlist(list: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

interface SymbolSidebarProps {
  symbol: Symbol;
  onSymbolChange: (s: Symbol) => void;
  loading?: boolean;
  price?: number;
  priceChange24h?: number;
  onLogoClick?: () => void;
}

export const SymbolSidebar: React.FC<SymbolSidebarProps> = ({
  symbol, onSymbolChange, loading, price = 0, priceChange24h = 0, onLogoClick,
}) => {
  const t = useT();
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist);
  const [input, setInput] = useState('');
  const [inputErr, setInputErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(() => {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    if (/[^\w]/.test(sym) || /[\u4e00-\u9fa5]/.test(sym)) {
      setInputErr(t.sidebar.invalidInput); return;
    }
    const full = sym.endsWith('USDT') ? sym : sym + 'USDT';
    if (watchlist.includes(full)) {
      setInputErr(t.sidebar.alreadyInList); return;
    }
    const next = [...watchlist, full];
    setWatchlist(next);
    saveWatchlist(next);
    setInput('');
    setInputErr('');
    onSymbolChange(full);
  }, [input, watchlist, onSymbolChange, t]);

  const handleRemove = useCallback((sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (DEFAULT_SYMBOLS.includes(sym as typeof DEFAULT_SYMBOLS[number])) return;
    const next = watchlist.filter((s) => s !== sym);
    setWatchlist(next);
    saveWatchlist(next);
    if (symbol === sym && next.length) onSymbolChange(next[0]);
  }, [watchlist, symbol, onSymbolChange]);

  const isPos = priceChange24h >= 0;

  return (
    <aside
      className="flex flex-col shrink-0 h-full"
      style={{
        width: 200,
        background: 'rgba(12,15,26,0.97)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo区 */}
      <div
        className="flex items-center gap-2 px-3 py-3.5 shrink-0"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          cursor: onLogoClick ? 'pointer' : 'default',
        }}
        onClick={onLogoClick}
        title={onLogoClick ? t.sidebar.backHome : undefined}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0"
          style={{ background: 'linear-gradient(135deg,rgba(0,212,170,0.25),rgba(0,212,170,0.05))', border: '1px solid rgba(0,212,170,0.3)' }}
        >
          🦞
        </div>
        <div>
          <div className="font-bold text-white text-sm leading-none" style={{ letterSpacing: '-0.02em' }}>{t.sidebar.brandName}</div>
          <div style={{ color: '#3C4255', fontSize: '9px', letterSpacing: '0.06em' }}>{t.sidebar.version}</div>
        </div>
      </div>

      {/* 当前标的价格 */}
      {price > 0 && (
        <div
          className="px-3 py-2.5 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,212,170,0.04)' }}
        >
          <div className="text-xs font-bold" style={{ color: '#3C4255' }}>{symbol}</div>
          <div className="font-mono font-bold text-white text-base" style={{ letterSpacing: '-0.03em' }}>
            ${price >= 1000 ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : price.toFixed(price >= 1 ? 2 : 4)}
          </div>
          <div className="text-xs font-semibold" style={{ color: isPos ? '#00D4AA' : '#F6465D' }}>
            {isPos ? '▲' : '▼'} {Math.abs(priceChange24h).toFixed(2)}%
          </div>
        </div>
      )}

      {/* 搜索添加 */}
      <div className="px-2.5 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setInputErr(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder={t.sidebar.inputPlaceholder}
            maxLength={16}
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg text-xs text-white font-mono outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${inputErr ? 'rgba(246,70,93,0.5)' : 'rgba(255,255,255,0.08)'}`,
            }}
          />
          <button
            onClick={handleAdd}
            className="px-2 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all"
            style={{ background: 'rgba(0,212,170,0.15)', color: '#00D4AA', border: '1px solid rgba(0,212,170,0.3)' }}
          >
            +
          </button>
        </div>
        {inputErr && <div className="text-xs mt-1" style={{ color: '#F6465D' }}>{inputErr}</div>}
      </div>

      {/* 自选列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-2.5 py-1.5 text-xs font-semibold" style={{ color: '#3C4255' }}>{t.sidebar.watchlistTitle}</div>
        {watchlist.map((sym) => {
          const meta = getSymbolMeta(sym);
          const isActive = sym === symbol;
          const isDefault = DEFAULT_SYMBOLS.includes(sym as typeof DEFAULT_SYMBOLS[number]);
          return (
            <div
              key={sym}
              onClick={() => !loading && onSymbolChange(sym)}
              className="group flex items-center gap-2 px-2.5 py-2 mx-1.5 mb-0.5 rounded-xl transition-all cursor-pointer"
              style={
                isActive
                  ? { background: 'rgba(0,212,170,0.12)', border: '1px solid rgba(0,212,170,0.25)' }
                  : { border: '1px solid transparent' }
              }
            >
              <span className="text-sm shrink-0">{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <div
                  className="text-xs font-bold truncate"
                  style={{ color: isActive ? '#00D4AA' : '#A0A8B8' }}
                >
                  {meta.label}
                </div>
                <div className="text-xs truncate" style={{ color: '#3C4255', fontSize: '9px' }}>{sym}</div>
              </div>
              {!isDefault && (
                <button
                  onClick={(e) => handleRemove(sym, e)}
                  className="opacity-0 group-hover:opacity-100 text-xs transition-opacity shrink-0 w-4 h-4 flex items-center justify-center rounded"
                  style={{ color: '#F6465D', background: 'rgba(246,70,93,0.1)' }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部状态 */}
      <div
        className="px-3 py-2 shrink-0 flex items-center gap-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            background: loading ? '#F0B90B' : '#00D4AA',
            animation: loading ? 'badge-pulse 1s infinite' : 'badge-pulse 3s infinite',
          }}
        />
        <span className="text-xs" style={{ color: '#3C4255' }}>{loading ? t.sidebar.analyzing : t.sidebar.ready}</span>
      </div>
    </aside>
  );
};
