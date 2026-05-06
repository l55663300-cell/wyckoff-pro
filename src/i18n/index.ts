/**
 * i18n — 国际化支持
 * 用法：const t = useT(); t.nav.aiAnalysis
 */

import { useState, useEffect } from 'react';
import { zh } from './zh';
import { en } from './en';

export type Lang = 'zh' | 'en';

const LS_KEY = 'wyckoff_lang';

export function getLang(): Lang {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'en' || v === 'zh') return v;
  } catch {}
  return 'zh';
}

export function setLang(lang: Lang) {
  try { localStorage.setItem(LS_KEY, lang); } catch {}
  window.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
}

export function toggleLang() {
  setLang(getLang() === 'zh' ? 'en' : 'zh');
}

export function getT() {
  return getLang() === 'en' ? en : zh;
}

/** React Hook：监听语言切换，自动触发重渲染 */
export function useT() {
  const [lang, setLangState] = useState<Lang>(getLang);

  useEffect(() => {
    const handler = (e: Event) => {
      setLangState((e as CustomEvent<Lang>).detail);
    };
    window.addEventListener('langchange', handler);
    return () => window.removeEventListener('langchange', handler);
  }, []);

  return lang === 'en' ? en : zh;
}
