import React, { useState } from 'react';
import { X, Bell, ExternalLink, CheckCircle, AlertCircle, Send } from 'lucide-react';
import { WechatPushConfig, loadPushConfig, savePushConfig, sendWechatPush } from '../utils/wechatPush';
import { useT } from '../i18n';

interface WechatAlertModalProps {
  onClose: () => void;
  onSave: (config: WechatPushConfig) => void;
}

export const WechatAlertModal: React.FC<WechatAlertModalProps> = ({ onClose, onSave }) => {
  const t = useT();
  const [config, setConfig] = useState<WechatPushConfig>(loadPushConfig);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSave = () => {
    savePushConfig(config);
    onSave(config);
    onClose();
  };

  const handleTest = async () => {
    if (!config.sendKey.trim()) {
      setTestResult({ ok: false, msg: t.wechat.sendKeyRequired });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const result = await sendWechatPush(
      { ...config, enabled: true },
      '🦞 威科夫Pro · 测试推送',
      '## 测试推送成功 ✅\n\n您的微信推送配置正常，当有入场信号时将自动推送。\n\n_威科夫Pro_'
    );
    setTestResult(result);
    setTesting(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg glass-card rounded-2xl overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="px-6 py-4 flex items-center gap-3" style={{ background: 'rgba(0,212,170,0.06)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,212,170,0.15)', border: '1px solid rgba(0,212,170,0.3)' }}>
            <Bell size={18} style={{ color: '#00D4AA' }} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-lg text-white">{t.wechat.title}</div>
            <div style={{ color: '#5C6478', fontSize: '12px' }}>{t.wechat.subtitle}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg transition-colors cursor-pointer" style={{ color: '#5C6478' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* How to get SendKey */}
          <div className="p-4 rounded-xl" style={{ background: 'rgba(77,159,255,0.06)', border: '1px solid rgba(77,159,255,0.15)' }}>
            <div className="font-semibold text-sm mb-2" style={{ color: '#4D9FFF' }}>{t.wechat.howToTitle}</div>
            <ol className="space-y-1.5" style={{ color: '#A0A8B8', fontSize: '12px' }}>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'rgba(77,159,255,0.2)', color: '#4D9FFF' }}>1</span>
                <span>{t.wechat.step1('sct.ftqq.com').replace('sct.ftqq.com', '')}
                  <a href="https://sct.ftqq.com/" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: '#4D9FFF' }}>sct.ftqq.com</a>
                  {t.wechat.step1('sct.ftqq.com').split('sct.ftqq.com')[1] ?? ''}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'rgba(77,159,255,0.2)', color: '#4D9FFF' }}>2</span>
                <span dangerouslySetInnerHTML={{ __html: t.wechat.step2.replace('SendKey', '<strong style="color:#E6E9F0">SendKey</strong>') }} />
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'rgba(77,159,255,0.2)', color: '#4D9FFF' }}>3</span>
                <span>{t.wechat.step3}</span>
              </li>
            </ol>
            <a
              href="https://sct.ftqq.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 mt-3 text-xs font-semibold"
              style={{ color: '#4D9FFF' }}
            >
              {t.wechat.goLink} <ExternalLink size={11} />
            </a>
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div>
              <div className="font-semibold text-sm text-white">{t.wechat.enableLabel}</div>
              <div style={{ color: '#5C6478', fontSize: '11px', marginTop: '2px' }}>{t.wechat.enableHint}</div>
            </div>
            <button
              onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
              className="w-12 h-6 rounded-full transition-all duration-300 relative cursor-pointer"
              style={{ background: config.enabled ? '#00D4AA' : 'rgba(255,255,255,0.1)' }}
            >
              <div className="w-5 h-5 rounded-full absolute top-0.5 transition-all duration-300"
                style={{ left: config.enabled ? '28px' : '2px', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
            </button>
          </div>

          {/* SendKey input */}
          <div>
            <label className="block font-semibold text-sm mb-2" style={{ color: '#E6E9F0' }}>
              SendKey <span style={{ color: '#FF4D6A' }}>*</span>
            </label>
            <input
              type="text"
              value={config.sendKey}
              onChange={(e) => setConfig((c) => ({ ...c, sendKey: e.target.value }))}
              placeholder="SCT_xxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-4 py-3 rounded-xl font-mono text-sm outline-none transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#E6E9F0',
                fontSize: '13px',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'rgba(0,212,170,0.5)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
            />
          </div>

          {/* Min probability */}
          <div>
            <label className="block font-semibold text-sm mb-2" style={{ color: '#E6E9F0' }}>
              {t.wechat.thresholdLabel(config.minProbability)}
            </label>
            <input
              type="range"
              min={50}
              max={90}
              step={5}
              value={config.minProbability}
              onChange={(e) => setConfig((c) => ({ ...c, minProbability: parseInt(e.target.value) }))}
              className="w-full cursor-pointer"
              style={{ accentColor: '#00D4AA' }}
            />
            <div className="flex justify-between text-xs font-mono mt-1" style={{ color: '#5C6478' }}>
              <span>{t.wechat.thresholdMin}</span>
              <span>{t.wechat.thresholdMax}</span>
            </div>
            <div style={{ color: '#A0A8B8', fontSize: '11px', marginTop: '4px' }}>
              {t.wechat.thresholdHint(config.minProbability)}
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${testResult.ok ? 'badge-bull' : 'badge-bear'}`}>
              {testResult.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
              <span>{testResult.ok ? t.wechat.testSuccess : t.wechat.testFail(testResult.msg)}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleTest}
              disabled={testing || !config.sendKey.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(77,159,255,0.15)', color: '#4D9FFF', border: '1px solid rgba(77,159,255,0.3)' }}
            >
              <Send size={14} className={testing ? 'spin-slow' : ''} />
              {testing ? t.wechat.testingBtn : t.wechat.testBtn}
            </button>
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #00D4AA, #00B896)', color: '#000', boxShadow: '0 4px 16px rgba(0,212,170,0.3)' }}
            >
              {t.wechat.saveBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
