import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { saveLLMConfig, clearLLMConfig, getLLMConfig, callLLM, type LLMConfig } from '../api/llmProvider';
import { saveSystemPrompt, resetSystemPrompt, loadSystemPrompt } from '../api/aiAnalysis';
import { loadOrders, approveOrder, rejectOrder, PAY_METHOD_LABEL, type RechargeOrder } from '../utils/rechargeStore';
import { loadUsers, toggleUserBan, setUserCredits, updateUserCredits, type StoredUser } from '../utils/userStore';
import {
  loadPlans, updatePlan,
  loadWallets, upsertWallet, deleteWallet,
  loadSubOrders, confirmSubOrder, rejectSubOrder,
  ORDER_STATUS_LABEL, CYCLE_LABEL,
  type SubscriptionPlan, type PaymentWallet, type SubscriptionOrder,
} from '../utils/subscriptionStore';
import { loadQueries, loadAllQueriesFromDB, type QueryRecord } from '../utils/queryStore';
import { loadNoticesFromDB, pushNotice, type Notice } from '../utils/noticeStore';
import { loadFeedbackFromDB, updateFeedbackStatus, FEEDBACK_TYPE_LABEL, FEEDBACK_STATUS_LABEL, type FeedbackItem } from '../utils/feedbackStore';
import { loadContent, savePartialContent, type SiteContent } from '../utils/contentStore';
import { loadSysConfig, saveSysConfig } from '../utils/sysConfigStore';

type AdminTab = 'dashboard' | 'users' | 'recharges' | 'suborders' | 'plans' | 'wallets' | 'queries' | 'notifications' | 'feedback' | 'content' | 'training' | 'llmconfig' | 'sysconfig' | 'admins';

const NAV_GROUPS = [
  {
    items: [{ key: 'dashboard', icon: '📊', label: '数据概览' }],
  },
  {
    label: '用户与收入',
    items: [
      { key: 'users',     icon: '👥', label: '用户管理' },
      { key: 'suborders', icon: '📦', label: '订阅订单' },
      { key: 'recharges', icon: '💰', label: '旧充值管理' },
    ],
  },
  {
    label: '套餐与钱包',
    items: [
      { key: 'plans',   icon: '🎯', label: '套餐管理' },
      { key: 'wallets', icon: '💳', label: '钱包地址' },
    ],
  },
  {
    label: '内容与运营',
    items: [
      { key: 'queries',       icon: '🔍', label: '查询记录' },
      { key: 'notifications', icon: '📢', label: '通知管理' },
      { key: 'feedback',      icon: '💬', label: '反馈管理' },
      { key: 'content',       icon: '🎨', label: '内容编辑' },
    ],
  },
  {
    label: 'AI 能力',
    items: [
      { key: 'training', icon: '🧠', label: 'AI 调教室' },
      { key: 'llmconfig', icon: '🤖', label: '模型配置' },
    ],
  },
  {
    label: '系统',
    items: [
      { key: 'sysconfig', icon: '⚙️', label: '系统配置' },
      { key: 'admins',    icon: '🔐', label: '管理员账号' },
    ],
  },
];

// 管理员角色权限定义
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['dashboard','users','recharges','queries','notifications','feedback','content','training','llmconfig','sysconfig','admins'],
  ops:         ['dashboard','users','recharges','queries','notifications','feedback'],
  content_admin: ['dashboard','content','notifications'],
  custom:      [],
};

const PERMISSION_LABELS: { key: string; label: string }[] = [
  { key: 'dashboard',      label: '数据概览' },
  { key: 'users',          label: '用户管理' },
  { key: 'recharges',      label: '充值管理' },
  { key: 'queries',        label: '查询记录' },
  { key: 'notifications',  label: '通知管理' },
  { key: 'feedback',       label: '反馈管理' },
  { key: 'content',        label: '内容编辑' },
  { key: 'training',       label: 'AI调教室' },
  { key: 'llmconfig',      label: '模型配置' },
  { key: 'sysconfig',      label: '系统配置' },
  { key: 'admins',         label: '管理员账号' },
];

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: 'super_admin' | 'ops' | 'content_admin' | 'custom';
  customPerms: string[];
  color: string;
  tc: string;
}

const INITIAL_ADMINS: AdminUser[] = [
  { id: 1, name: 'Super Admin', email: 'admin@wyckoff.pro',   role: 'super_admin',   customPerms: [], color: 'rgba(240,180,41,0.15)', tc: 'var(--primary)' },
  { id: 2, name: '运营小李',     email: 'ops@wyckoff.pro',     role: 'ops',           customPerms: [], color: 'rgba(99,179,237,0.12)',  tc: '#63b3ed' },
  { id: 3, name: '内容编辑',     email: 'content@wyckoff.pro', role: 'content_admin', customPerms: [], color: 'rgba(154,230,180,0.12)', tc: '#68d391' },
];

const ROLE_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  super_admin:   { label: '总管理员', color: 'var(--primary)',  bg: 'rgba(240,180,41,0.15)' },
  ops:           { label: '运营',    color: '#63b3ed',          bg: 'rgba(99,179,237,0.12)' },
  content_admin: { label: '内容',    color: '#68d391',          bg: 'rgba(154,230,180,0.12)' },
  custom:        { label: '自定义',  color: '#b794f4',          bg: 'rgba(183,148,244,0.12)' },
};

export default function AdminPage() {
  const { navigate, logout, user } = useApp();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [toast, setToast] = useState('');

  // ── 各模块数据 ──
  const [rechargeOrders, setRechargeOrders] = useState<RechargeOrder[]>([]);
  const [userList, setUserList] = useState<StoredUser[]>([]);
  const [queryList, setQueryList] = useState<QueryRecord[]>([]);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [noticeList, setNoticeList] = useState<Notice[]>([]);
  const [siteContent, setSiteContent] = useState<SiteContent>(loadContent);

  // ── 套餐管理 ──
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planForm, setPlanForm] = useState<Partial<SubscriptionPlan>>({});

  // ── 钱包管理 ──
  const [wallets, setWallets] = useState<PaymentWallet[]>([]);
  const [editingWallet, setEditingWallet] = useState<PaymentWallet | null>(null);
  const [walletForm, setWalletForm] = useState<Partial<PaymentWallet>>({});
  const [showWalletModal, setShowWalletModal] = useState(false);

  // ── 订阅订单 ──
  const [subOrders, setSubOrders] = useState<SubscriptionOrder[]>([]);
  const [subOrderFilter, setSubOrderFilter] = useState<'all' | 'pending' | 'confirmed' | 'rejected'>('all');

  // ── 用户管理搜索/筛选 ──
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'banned'>('all');
  const [adjustModal, setAdjustModal] = useState<{ uid: string; email: string; current: number } | null>(null);
  const [adjustValue, setAdjustValue] = useState('');

  // ── 查询记录筛选 ──
  const [querySearch, setQuerySearch] = useState('');
  const [queryTfFilter, setQueryTfFilter] = useState('全部周期');

  // ── 反馈筛选 ──
  const [fbTypeFilter, setFbTypeFilter] = useState('全部类型');
  const [fbStatusFilter, setFbStatusFilter] = useState('全部状态');

  // ── 通知管理表单 ──
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeType, setNoticeType] = useState<Notice['type']>('announcement');

  // ── 系统配置（sysConfigStore）──
  const [sysCfg, setSysCfg] = useState(() => loadSysConfig());
  const handleSaveSys = () => {
    saveSysConfig(sysCfg);
    showToast('✅ 基础配置已保存，订阅页立即生效');
  };

  // ── 内容编辑受控状态 ──
  const [heroTitle, setHeroTitle] = useState(siteContent.hero.title);
  const [heroSubtitle, setHeroSubtitle] = useState(siteContent.hero.subtitle);
  const [heroCtaText, setHeroCtaText] = useState(siteContent.hero.ctaText);
  const [heroCtaSub, setHeroCtaSub] = useState(siteContent.hero.ctaSubText);
  const [bannerEnabled, setBannerEnabled] = useState(siteContent.banner.enabled);
  const [bannerText, setBannerText] = useState(siteContent.banner.text);
  const [bannerLink, setBannerLink] = useState(siteContent.banner.linkText);

  // 切换 tab 时刷新对应数据
  useEffect(() => {
    if (activeTab === 'recharges') void Promise.resolve(loadOrders()).then(setRechargeOrders);
    if (activeTab === 'users') void loadUsers().then(setUserList);
    if (activeTab === 'queries') void loadAllQueriesFromDB().then(setQueryList);
    if (activeTab === 'feedback') void loadFeedbackFromDB().then(setFeedbackList);
    if (activeTab === 'notifications') void loadNoticesFromDB().then(setNoticeList);
    if (activeTab === 'plans') void loadPlans().then(setPlans);
    if (activeTab === 'wallets') void loadWallets().then(setWallets);
    if (activeTab === 'suborders') void loadSubOrders().then(setSubOrders);
    if (activeTab === 'content') {
      const c = loadContent();
      setSiteContent(c);
      setHeroTitle(c.hero.title); setHeroSubtitle(c.hero.subtitle);
      setHeroCtaText(c.hero.ctaText); setHeroCtaSub(c.hero.ctaSubText);
      setBannerEnabled(c.banner.enabled); setBannerText(c.banner.text); setBannerLink(c.banner.linkText);
    }
    if (activeTab === 'dashboard') {
      void Promise.all([Promise.resolve(loadOrders()), loadUsers()]).then(([orders, users]) => {
        setRechargeOrders(orders);
        setUserList(users);
      });
      void loadAllQueriesFromDB().then(setQueryList);
      void loadFeedbackFromDB().then(setFeedbackList);
    }
    if (activeTab === 'admins') void loadAdmins();
  }, [activeTab]);

  // 管理员账号状态（从 Supabase profiles 真实读取）
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editAdmin, setEditAdmin] = useState<AdminUser | null>(null);

  // 加载真实管理员列表
  const loadAdmins = async () => {
    setAdminsLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('uid, email, name, is_admin, admin_role, admin_perms')
        .eq('is_admin', true);
      if (data) {
        setAdmins(data.map((row, i) => {
          const role = (row.admin_role as AdminUser['role']) ?? 'super_admin';
          const info = ROLE_DISPLAY[role] ?? ROLE_DISPLAY.custom;
          return {
            id: i + 1,
            name: row.name ?? row.email?.split('@')[0] ?? '',
            email: row.email ?? '',
            role,
            customPerms: (row.admin_perms as string[]) ?? [],
            color: info.bg,
            tc: info.color,
            uid: row.uid,
          };
        }));
      }
    } finally {
      setAdminsLoading(false);
    }
  };

  // AI调教室状态 — 从 localStorage 读取已保存的 System Prompt
  const [systemPrompt, setSystemPrompt] = useState(() => loadSystemPrompt());
  const [kbEntries, setKbEntries] = useState([
    { id: 1, title: '威科夫积累阶段详解', type: 'text', size: '2.3KB', updated: '2026-04-20' },
    { id: 2, title: '量价关系分析手册',   type: 'pdf',  size: '128KB', updated: '2026-04-18' },
    { id: 3, title: 'BTC历史走势案例库',  type: 'json', size: '56KB',  updated: '2026-04-15' },
  ]);
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [testLoading, setTestLoading] = useState(false);

  // 模型配置状态 — 从 localStorage 读取已保存配置
  const _savedLLM = getLLMConfig();
  const [selectedProvider, setSelectedProvider] = useState<string>(_savedLLM?.provider ?? 'deepseek');
  const [apiKey, setApiKey] = useState(_savedLLM?.apiKey ?? '');
  const [showKey, setShowKey] = useState(false);
  const [testConnStatus, setTestConnStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>(_savedLLM?.apiKey ? 'ok' : 'idle');
  const [testConnMsg, setTestConnMsg] = useState('');
  const [selectedModel, setSelectedModel] = useState(_savedLLM?.model ?? 'deepseek-chat');
  const [customModel, setCustomModel] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState(_savedLLM?.baseUrl ?? 'https://api.deepseek.com/v1');
  const [temperature, setTemperature] = useState(String(_savedLLM?.temperature ?? '0.3'));
  const [maxTokens, setMaxTokens] = useState(String(_savedLLM?.maxTokens ?? '2000'));

  const PROVIDERS = [
    { key: 'deepseek', label: 'DeepSeek',   models: ['deepseek-chat', 'deepseek-reasoner'],    endpoint: 'https://api.deepseek.com/v1' },
    { key: 'openai',   label: 'OpenAI',     models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'], endpoint: 'https://api.openai.com/v1' },
    { key: 'zhipu',    label: '智谱 GLM',   models: ['glm-4', 'glm-4-flash'],                  endpoint: 'https://open.bigmodel.cn/api/paas/v4' },
    { key: 'moonshot', label: 'Moonshot',   models: ['moonshot-v1-8k', 'moonshot-v1-32k'],    endpoint: 'https://api.moonshot.cn/v1' },
    { key: 'custom',   label: '自定义',     models: [],                                         endpoint: '' },
  ];

  const currentProvider = PROVIDERS.find(p => p.key === selectedProvider) ?? PROVIDERS[0];

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleTestPrompt = async () => {
    if (!testInput.trim()) { showToast('请输入测试内容'); return; }
    const cfg = getLLMConfig();
    if (!cfg) { showToast('请先在【模型配置】中保存 API Key'); return; }
    setTestLoading(true);
    setTestOutput('');
    try {
      const result = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: testInput.trim() },
      ], cfg);
      setTestOutput(result.content);
    } catch (e: any) {
      setTestOutput(`❌ 调用失败：${e?.message ?? '未知错误'}`);
    } finally {
      setTestLoading(false);
    }
  };

  const openEditModal = (admin: AdminUser | null) => {
    setEditAdmin(admin ? { ...admin } : {
      id: Date.now(), name: '', email: '', role: 'ops', customPerms: [], color: 'rgba(99,179,237,0.12)', tc: '#63b3ed',
    });
    setShowAdminModal(true);
  };

  const handleSaveAdmin = async () => {
    if (!editAdmin) return;
    if (!editAdmin.email.trim()) { showToast('请填写邮箱'); return; }
    // 通过邮箱在 profiles 表查找 uid，然后设置 is_admin=true + 角色权限
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('uid')
      .eq('email', editAdmin.email.trim())
      .single();
    if (error || !profile) {
      showToast('❌ 未找到该邮箱对应的注册用户，请确认邮箱已注册');
      return;
    }
    const perms = editAdmin.role === 'custom' ? editAdmin.customPerms : ROLE_PERMISSIONS[editAdmin.role] ?? [];
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        is_admin: true,
        name: editAdmin.name.trim() || undefined,
        admin_role: editAdmin.role,
        admin_perms: perms,
      })
      .eq('uid', profile.uid);
    if (updateError) {
      showToast('❌ 设置失败：' + updateError.message);
      return;
    }
    setShowAdminModal(false);
    showToast('✅ 管理员权限已生效，该用户下次登录即可访问后台');
    void loadAdmins();
  };

  const getEffectivePerms = (admin: AdminUser) =>
    admin.role === 'custom' ? admin.customPerms : ROLE_PERMISSIONS[admin.role] ?? [];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg1)' }}>

      {/* ── 左侧边栏 ── */}
      <aside style={{
        width: 228, flexShrink: 0,
        background: 'var(--bg2)', borderRight: '1px solid var(--border-light)',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh',
        boxShadow: '1px 0 0 rgba(0,0,0,0.04)',
      }}>
        <div style={{
          padding: '20px 20px 16px', borderBottom: '1px solid var(--border-light)',
          fontSize: 15, fontWeight: 700, color: 'var(--t1)',
          display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer',
        }}
          onClick={() => navigate('app')}
          title="返回分析主页"
        >
          <span style={{ fontSize: 20 }}>⚙️</span>
          <span>后台管理</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {NAV_GROUPS.map((group, gi) => {
            // 按当前用户的 admin_perms 过滤菜单项（super_admin 或无 perms 时显示全部）
            const visibleItems = group.items.filter(item => {
              if (!user?.adminPerms || user.adminPerms.length === 0) return true;
              return user.adminPerms.includes(item.key);
            });
            if (visibleItems.length === 0) return null;
            return (
            <div key={gi}>
              {group.label && (
                <div style={{ padding: '10px 20px 4px', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: 'var(--t3)', textTransform: 'uppercase' }}>
                  {group.label}
                </div>
              )}
              {visibleItems.map(item => (
                <div key={item.key} onClick={() => setActiveTab(item.key as AdminTab)}
                  className={`nav-item${activeTab === item.key ? ' active' : ''}`}
                >
                  <span style={{ width: 18, fontSize: 15, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                  {item.label}
                </div>
              ))}
              {gi < NAV_GROUPS.length - 1 && (
                <div style={{ height: 1, background: 'var(--border-light)', margin: '6px 16px' }} />
              )}
            </div>
            );
          })}
        </div>

        <div style={{
          padding: '14px 16px', borderTop: '1px solid var(--border-light)',
          display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg2)',
        }}>
          <button
            onClick={() => navigate('app')}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 600,
              background: 'var(--primary-bg)', color: 'var(--primary)',
              border: '1px solid rgba(0,122,255,0.2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all .15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,255,0.14)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--primary-bg)'; }}
          >
            ← 返回分析主页
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'var(--primary-bg)', border: '1.5px solid rgba(0,122,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: 'var(--primary)',
            }}>S</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Super Admin</div>
              <div style={{ marginTop: 2 }}>
                <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'var(--primary-bg)', color: 'var(--primary)' }}>总管理员</span>
              </div>
            </div>
            <div style={{ fontSize: 18, cursor: 'pointer', color: 'var(--t3)', transition: 'color .15s' }} title="退出登录"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
              onClick={() => logout()}
            >⏏</div>
          </div>
        </div>
      </aside>

      {/* ── 右侧内容区 ── */}
      <main style={{ flex: 1, padding: '32px 36px', overflowY: 'auto', minWidth: 0, background: 'var(--bg1)' }}>

        {/* ════ 数据概览 ════ */}
        {activeTab === 'dashboard' && (() => {
          const today = new Date().toDateString();
          const totalUsers = userList.length;
          const todayUsers = userList.filter(u => new Date(u.createdAt).toDateString() === today).length;
          const todayQueries = queryList.filter(q => new Date(q.createdAt).toDateString() === today).length;
          const totalRechargeAmt = rechargeOrders.filter(o => o.status === 'approved').reduce((s, o) => s + o.price, 0);
          const pendingRecharges = rechargeOrders.filter(o => o.status === 'pending').length;
          const pendingFeedback = feedbackList.filter(f => f.status === 'pending').length;
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const activeUsers7d = userList.filter(u => new Date(u.createdAt).getTime() > sevenDaysAgo).length;

          // 最近7天每天查询量
          const last7 = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (6 - i));
            const ds = d.toDateString();
            return queryList.filter(q => new Date(q.createdAt).toDateString() === ds).length;
          });
          const maxBar = Math.max(...last7, 1);

          const pendingTodos = [
            pendingRecharges > 0 && { icon: '💰', text: `${pendingRecharges} 条充值申请待审核`, action: () => setActiveTab('recharges'), color: 'var(--primary)' },
            pendingFeedback > 0  && { icon: '💬', text: `${pendingFeedback} 条用户反馈待处理`,  action: () => setActiveTab('feedback'),  color: 'var(--red)' },
          ].filter(Boolean) as { icon: string; text: string; action: () => void; color: string }[];

          return (
            <div>
              <PageTitle title="📊 数据概览" sub="截至今日 · 实时更新" />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                {[
                  { label: '注册用户数',    value: String(totalUsers),               change: `+${todayUsers} 今日新增`,   changeColor: 'var(--green)',   icon: '👥' },
                  { label: '今日新增用户',  value: String(todayUsers),               change: '今日注册',                  changeColor: 'var(--green)',   icon: '📈' },
                  { label: '今日查询次数',  value: String(todayQueries),             change: '今日 AI 分析次数',          changeColor: 'var(--green)',   icon: '🔍' },
                  { label: '累计充值金额',  value: `¥${totalRechargeAmt.toFixed(0)}`, change: '已审核通过金额',           changeColor: 'var(--green)',   icon: '💰' },
                  { label: '7天新增用户',   value: String(activeUsers7d),            change: '近7天注册',                 changeColor: 'var(--primary)', icon: '⚡' },
                  { label: '待审核充值',    value: String(pendingRecharges),         change: pendingRecharges > 0 ? '需要处理' : '无待处理', changeColor: pendingRecharges > 0 ? '#f97316' : 'var(--green)', icon: '⏳' },
                ].map(stat => (
                  <div key={stat.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: 'var(--t2)' }}>{stat.label}</div>
                      <span style={{ fontSize: 20 }}>{stat.icon}</span>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--t1)' }}>{stat.value}</div>
                    <div style={{ fontSize: 12, color: stat.changeColor, marginTop: 6 }}>{stat.change}</div>
                  </div>
                ))}
              </div>

              <AdminCard title="📅 最近7天查询趋势">
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90, padding: '10px 0 0' }}>
                  {last7.map((count, i) => {
                    const h = Math.max(6, Math.round((count / maxBar) * 100));
                    const days = ['一','二','三','四','五','六','今'];
                    const d = new Date(); d.setDate(d.getDate() - (6 - i));
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${count} 次查询`}>
                        <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>{count > 0 ? count : ''}</div>
                        <div style={{ width: '100%', height: `${h}%`, background: i === 6 ? 'var(--primary)' : 'rgba(240,180,41,0.3)', borderRadius: '4px 4px 0 0', minHeight: 4 }} />
                        <div style={{ fontSize: 10, color: 'var(--t3)' }}>{days[i]}</div>
                      </div>
                    );
                  })}
                </div>
              </AdminCard>

              {pendingTodos.length > 0 && (
                <AdminCard title="⚡ 待处理事项">
                  {pendingTodos.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < pendingTodos.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ fontSize: 20 }}>{item.icon}</span>
                      <div style={{ flex: 1, fontSize: 13, color: 'var(--t1)' }}>{item.text}</div>
                      <button onClick={item.action} style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, border: `1px solid ${item.color}`, color: item.color, background: 'transparent', cursor: 'pointer' }}>处理</button>
                    </div>
                  ))}
                </AdminCard>
              )}
            </div>
          );
        })()}

        {/* ════ 用户管理 ════ */}
        {activeTab === 'users' && (() => {
          const filtered = userList.filter(u => {
            const matchSearch = !userSearch || u.email.includes(userSearch) || u.uid.includes(userSearch);
            const matchStatus = userStatusFilter === 'all' || u.status === userStatusFilter;
            return matchSearch && matchStatus;
          });
          const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString('zh-CN'); } catch { return iso; } };
          return (
            <div>
              <PageTitle title="👥 用户管理" sub={`共 ${userList.length} 位注册用户`} />

              {/* 调整次数弹窗 */}
              {adjustModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border-light)', borderRadius: 18, padding: 28, width: 340, boxShadow: 'var(--shadow-modal)', animation: 'fadeIn .2s ease' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: 'var(--t1)' }}>调整次数</div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>{adjustModal.email}，当前余额：{adjustModal.current} 次</div>
                    <input value={adjustValue} onChange={e => setAdjustValue(e.target.value)} type="number" min="0"
                      style={{ ...inputStyle, width: '100%', marginBottom: 16 }} placeholder="输入新的次数（直接覆盖）" />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => {
                        const n = parseInt(adjustValue);
                        if (isNaN(n) || n < 0) { showToast('请输入有效数字'); return; }
                        setUserCredits(adjustModal.uid, n);
                        loadUsers().then(setUserList);
                        setAdjustModal(null); setAdjustValue('');
                        showToast(`✅ 已将 ${adjustModal.email} 次数设置为 ${n} 次`);
                      }} style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--primary)', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer' }}>确认</button>
                      <button onClick={() => { setAdjustModal(null); setAdjustValue(''); }} style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--bg3)', color: 'var(--t2)', border: '1px solid var(--border)', cursor: 'pointer' }}>取消</button>
                    </div>
                  </div>
                </div>
              )}

              <AdminCard title="用户列表">
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <input value={userSearch} onChange={e => setUserSearch(e.target.value)} style={{ flex: 1, ...inputStyle }} placeholder="搜索邮箱 / UID..." />
                  <select value={userStatusFilter} onChange={e => setUserStatusFilter(e.target.value as 'all'|'active'|'banned')} style={{ ...inputStyle, width: 110 }}>
                    {[['all','全部状态'],['active','正常'],['banned','已封禁']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                {filtered.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: 14 }}>
                    {userList.length === 0 ? '暂无注册用户' : '无匹配结果'}
                  </div>
                ) : (
                  <AdminTable
                    headers={['UID', '邮箱', '剩余次数', '注册时间', '状态', '操作']}
                    rows={filtered.map(u => [u.uid, u.email, String(u.credits), fmtDate(u.createdAt), u.status, u.uid])}
                    renderCell={(val, colIdx, row) => {
                      if (colIdx === 4) {
                        const isBanned = val === 'banned';
                        return <StatusBadge label={isBanned ? '已封禁' : '正常'} color={isBanned ? 'var(--red)' : 'var(--green)'} bg={isBanned ? 'rgba(255,77,109,0.15)' : 'rgba(0,200,150,0.15)'} />;
                      }
                      if (colIdx === 5) {
                        const uid = row[5]!;
                        const u = filtered.find(x => x.uid === uid)!;
                        return (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <ActionBtn onClick={() => { setAdjustModal({ uid: u.uid, email: u.email, current: u.credits }); setAdjustValue(String(u.credits)); }} label="调整次数" />
                            <ActionBtn onClick={async () => {
                              await toggleUserBan(uid);
                              setUserList(await loadUsers());
                              showToast(u.status === 'banned' ? `✅ 已解封 ${u.email}` : `🚫 已封禁 ${u.email}`);
                            }} label={u.status === 'banned' ? '解封' : '封禁'} color={u.status === 'banned' ? 'var(--green)' : 'var(--red)'} />
                          </div>
                        );
                      }
                      return val;
                    }}
                  />
                )}
              </AdminCard>
            </div>
          );
        })()}

        {/* ════ 充值管理（旧按量包历史） ════ */}
        {activeTab === 'recharges' && (() => {
          const pending = rechargeOrders.filter(o => o.status === 'pending');
          const history = rechargeOrders.filter(o => o.status !== 'pending');

          const handleApprove = (order: RechargeOrder) => {
            const updated = approveOrder(order.id, 'Super Admin 审核通过');
            if (!updated) return;
            // 给用户加次数（更新 userStore）
            updateUserCredits(order.uid, order.email, order.count);
            // 同步更新 session localStorage，触发 storage 事件让在线用户实时感知
            try {
              const raw = localStorage.getItem('wyckoff_user_session');
              if (raw) {
                const u = JSON.parse(raw);
                if (u.uid === order.uid || u.email === order.email) {
                  u.credits = (u.credits ?? 0) + order.count;
                  // 用 removeItem + setItem 强制触发 storage 事件（同页面也能感知）
                  localStorage.removeItem('wyckoff_user_session');
                  localStorage.setItem('wyckoff_user_session', JSON.stringify(u));
                  // 同页面补发自定义事件
                  window.dispatchEvent(new StorageEvent('storage', { key: 'wyckoff_user_session', newValue: JSON.stringify(u) }));
                }
              }
            } catch {}
            setRechargeOrders(loadOrders());
            showToast(`✅ 已通过 — 已为 ${order.email} 发放 ${order.count} 次`);
          };

          const handleReject = (order: RechargeOrder) => {
            rejectOrder(order.id, 'Super Admin 拒绝');
            setRechargeOrders(loadOrders());
            showToast(`❌ 已拒绝 — ${order.email} 的申请`);
          };

          const fmtTime = (iso: string) => {
            try { return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
            catch { return iso; }
          };

          return (
            <div>
              <PageTitle title="💰 充值管理" sub="审核充值申请，确认收款后点击通过，系统自动发放次数" />

              <AdminCard title={`⏳ 待审核充值（${pending.length} 条）`}>
                {pending.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: 14 }}>暂无待审核申请 🎉</div>
                ) : (
                  <AdminTable
                    headers={['用户邮箱', '套餐', '金额', '支付方式', '提交时间', '操作']}
                    rows={pending.map(o => [o.email, o.packLabel, `¥${o.price}`, PAY_METHOD_LABEL[o.payMethod], fmtTime(o.createdAt), o.id])}
                    renderCell={(val, colIdx, row) => {
                      if (colIdx === 5) {
                        const orderId = row[5];
                        const order = pending.find(o => o.id === orderId);
                        if (!order) return null;
                        return (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <ActionBtn onClick={() => handleApprove(order)} label="通过" color="var(--green)" />
                            <ActionBtn onClick={() => handleReject(order)} label="拒绝" color="var(--red)" />
                          </div>
                        );
                      }
                      return val;
                    }}
                  />
                )}
              </AdminCard>

              <AdminCard title="📋 审核历史">
                {history.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: 14 }}>暂无审核记录</div>
                ) : (
                  <AdminTable
                    headers={['用户邮箱', '套餐', '金额', '支付方式', '状态', '审核时间']}
                    rows={history.map(o => [o.email, o.packLabel, `¥${o.price}`, PAY_METHOD_LABEL[o.payMethod], o.status, fmtTime(o.reviewedAt ?? o.createdAt)])}
                    renderCell={(val, colIdx) => {
                      if (colIdx === 4) {
                        const ok = val === 'approved';
                        return <StatusBadge label={ok ? '已通过' : '已拒绝'} color={ok ? 'var(--green)' : 'var(--red)'} bg={ok ? 'rgba(0,200,150,0.15)' : 'rgba(255,77,109,0.15)'} />;
                      }
                      return val;
                    }}
                  />
                )}
              </AdminCard>
            </div>
          );
        })()}

        {/* ════ 订阅订单管理 ════ */}
        {activeTab === 'suborders' && (() => {
          const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
          const filtered = subOrders.filter(o => subOrderFilter === 'all' || o.status === subOrderFilter);

          const handleConfirm = async (order: SubscriptionOrder) => {
            await confirmSubOrder(order.id, '管理员审核通过，已开通订阅');
            const orders = await loadSubOrders();
            setSubOrders(orders);
            showToast(`✅ 已确认 — ${order.email} 的 ${order.planName} 订阅已开通`);
          };
          const handleRejectSub = async (order: SubscriptionOrder) => {
            await rejectSubOrder(order.id, '管理员拒绝');
            const orders = await loadSubOrders();
            setSubOrders(orders);
            showToast(`❌ 已拒绝 — ${order.email} 的订阅申请`);
          };

          const pendingCount = subOrders.filter(o => o.status === 'pending').length;

          return (
            <div>
              <PageTitle title="📦 订阅订单" sub="审核 USDT 充值订单，确认到账后一键开通订阅" />

              {/* 状态筛选 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {(['all', 'pending', 'confirmed', 'rejected'] as const).map(f => (
                  <button key={f} onClick={() => setSubOrderFilter(f)} style={{
                    padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${subOrderFilter === f ? 'var(--primary)' : 'var(--border)'}`,
                    background: subOrderFilter === f ? 'rgba(240,180,41,0.1)' : 'transparent',
                    color: subOrderFilter === f ? 'var(--primary)' : 'var(--t2)',
                  }}>
                    {f === 'all' ? `全部（${subOrders.length}）` : f === 'pending' ? `待审核（${pendingCount}）` : f === 'confirmed' ? '已确认' : '已拒绝'}
                  </button>
                ))}
              </div>

              <AdminCard title={`订单列表（${filtered.length} 条）`}>
                {filtered.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: 14 }}>暂无订单 🎉</div>
                ) : (
                  <AdminTable
                    headers={['用户邮箱', '套餐', '周期', '金额(USD)', '钱包网络', 'TxHash', '状态', '提交时间', '操作']}
                    rows={filtered.map(o => [o.email, o.planName, CYCLE_LABEL[o.cycle], `$${o.amountUsd}`, o.walletNetwork, o.txHash ?? '—', o.status, fmtTime(o.createdAt), o.id])}
                    renderCell={(val, colIdx, row) => {
                      if (colIdx === 5) {
                        // TxHash — 完整展示，点击复制
                        if (val === '—') return <span style={{ color: 'var(--t3)' }}>—</span>;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--t2)', wordBreak: 'break-all', maxWidth: 240 }}>{val}</span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(val); showToast('✅ TxHash 已复制'); }}
                              style={{ fontSize: 10, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                            >复制</button>
                          </div>
                        );
                      }
                      if (colIdx === 6) {
                        const colors: Record<string, string> = { pending: 'var(--primary)', confirmed: 'var(--green)', rejected: 'var(--red)' };
                        return <StatusBadge label={ORDER_STATUS_LABEL[val as keyof typeof ORDER_STATUS_LABEL] ?? val} color={colors[val] ?? 'var(--t2)'} bg={`${colors[val]}22`} />;
                      }
                      if (colIdx === 8) {
                        const orderId = row[8];
                        const order = filtered.find(o => o.id === orderId);
                        if (!order || order.status !== 'pending') return <span style={{ color: 'var(--t3)', fontSize: 12 }}>—</span>;
                        return (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <ActionBtn onClick={() => handleConfirm(order)} label="确认开通" color="var(--green)" />
                            <ActionBtn onClick={() => handleRejectSub(order)} label="拒绝" color="var(--red)" />
                          </div>
                        );
                      }
                      return val;
                    }}
                  />
                )}
              </AdminCard>
            </div>
          );
        })()}

        {/* ════ 套餐管理 ════ */}
        {activeTab === 'plans' && (() => {
          const handleEditPlan = (plan: SubscriptionPlan) => {
            setEditingPlan(plan);
            setPlanForm({ ...plan });
          };
          const handleSavePlan = async () => {
            if (!editingPlan) return;
            await updatePlan(editingPlan.id, {
              name: planForm.name,
              priceUsd: Number(planForm.priceUsd),
              dailyLimit: Number(planForm.dailyLimit),
              hourlyLimit: Number(planForm.hourlyLimit),
              durationDays: Number(planForm.durationDays),
              isActive: planForm.isActive,
              sortOrder: Number(planForm.sortOrder),
              popular: planForm.popular,
            });
            const plans = await loadPlans();
            setPlans(plans);
            setEditingPlan(null);
            showToast('✅ 套餐已更新，立即生效');
          };

          return (
            <div>
              <PageTitle title="🎯 套餐管理" sub="修改价格和每日/小时次数后立即对所有该套餐用户生效" />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                {plans.map(plan => (
                  <AdminCard key={plan.id} title={`${plan.name}（${CYCLE_LABEL[plan.cycle]}）`}>
                    {editingPlan?.id === plan.id ? (
                      /* 编辑表单 */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {[
                          { label: '套餐名称', field: 'name', type: 'text' },
                          { label: '价格（USD）', field: 'priceUsd', type: 'number' },
                          { label: '有效天数', field: 'durationDays', type: 'number' },
                          { label: '每日次数上限', field: 'dailyLimit', type: 'number' },
                          { label: '每小时次数上限', field: 'hourlyLimit', type: 'number' },
                          { label: '排序', field: 'sortOrder', type: 'number' },
                        ].map(({ label, field, type }) => (
                          <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 12, color: 'var(--t3)', width: 120, flexShrink: 0 }}>{label}</span>
                            <input
                              type={type}
                              value={String(planForm[field as keyof SubscriptionPlan] ?? '')}
                              onChange={e => setPlanForm(prev => ({ ...prev, [field]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                              style={{ ...inputStyle, flex: 1 }}
                            />
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t2)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!planForm.isActive} onChange={e => setPlanForm(prev => ({ ...prev, isActive: e.target.checked }))} />
                            上架展示
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t2)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!planForm.popular} onChange={e => setPlanForm(prev => ({ ...prev, popular: e.target.checked }))} />
                            标记"最受欢迎"
                          </label>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <ActionBtn onClick={handleSavePlan} label="保存" color="var(--green)" />
                          <ActionBtn onClick={() => setEditingPlan(null)} label="取消" color="var(--t3)" />
                        </div>
                      </div>
                    ) : (
                      /* 展示模式 */
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 14 }}>
                          {[
                            { label: '价格', value: `$${plan.priceUsd} / ${CYCLE_LABEL[plan.cycle]}` },
                            { label: '有效天数', value: `${plan.durationDays} 天` },
                            { label: '每日次数上限', value: `${plan.dailyLimit} 次` },
                            { label: '每小时限流', value: `${plan.hourlyLimit} 次/小时` },
                          ].map(item => (
                            <div key={item.label}>
                              <div style={{ fontSize: 11, color: 'var(--t3)' }}>{item.label}</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginTop: 2 }}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <StatusBadge label={plan.isActive ? '已上架' : '已下架'} color={plan.isActive ? 'var(--green)' : 'var(--t3)'} bg={plan.isActive ? 'rgba(0,200,150,0.12)' : 'rgba(100,100,100,0.15)'} />
                          {plan.popular && <StatusBadge label="最受欢迎" color="var(--primary)" bg="rgba(240,180,41,0.12)" />}
                        </div>
                        <ActionBtn onClick={() => handleEditPlan(plan)} label="✏️ 编辑" color="var(--primary)" />
                      </div>
                    )}
                  </AdminCard>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ════ 钱包管理 ════ */}
        {activeTab === 'wallets' && (() => {
          const openAddWallet = () => {
            setEditingWallet(null);
            setWalletForm({ id: `w${Date.now()}`, label: '', address: '', network: 'TRC20', isActive: true, sortOrder: wallets.length + 1 });
            setShowWalletModal(true);
          };
          const openEditWallet = (w: PaymentWallet) => {
            setEditingWallet(w);
            setWalletForm({ ...w });
            setShowWalletModal(true);
          };
          const handleSaveWallet = async () => {
            if (!walletForm.address?.trim() || !walletForm.label?.trim()) { showToast('请填写钱包标签和地址'); return; }
            await upsertWallet(walletForm as PaymentWallet);
            setWallets(await loadWallets());
            setShowWalletModal(false);
            showToast('✅ 钱包已保存');
          };
          const handleDeleteWallet = async (id: string) => {
            await deleteWallet(id);
            setWallets(await loadWallets());
            showToast('已删除钱包地址');
          };
          const handleToggleWallet = async (w: PaymentWallet) => {
            await upsertWallet({ ...w, isActive: !w.isActive });
            setWallets(await loadWallets());
          };

          return (
            <div>
              <PageTitle title="💳 钱包地址管理" sub="管理 USDT 收款钱包，用户购买套餐时展示活跃钱包" />

              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={openAddWallet} style={{
                  padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #f0b429, #e8920a)', color: '#000', border: 'none',
                }}>+ 新增钱包地址</button>
              </div>

              <AdminCard title={`钱包列表（${wallets.length} 个）`}>
                {wallets.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: 14 }}>暂无钱包，点击右上角新增</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {wallets.sort((a, b) => a.sortOrder - b.sortOrder).map(w => (
                      <div key={w.id} style={{
                        background: 'var(--bg3)', borderRadius: 10, padding: '14px 16px',
                        border: `1px solid ${w.isActive ? 'rgba(240,180,41,0.3)' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', gap: 14,
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{w.label}</span>
                            <StatusBadge label={w.network} color="var(--primary)" bg="rgba(240,180,41,0.1)" />
                            <StatusBadge label={w.isActive ? '展示中' : '已隐藏'} color={w.isActive ? 'var(--green)' : 'var(--t3)'} bg={w.isActive ? 'rgba(0,200,150,0.1)' : 'rgba(100,100,100,0.15)'} />
                          </div>
                          <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--t2)', wordBreak: 'break-all' }}>{w.address}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <ActionBtn onClick={() => handleToggleWallet(w)} label={w.isActive ? '隐藏' : '展示'} color="var(--primary)" />
                          <ActionBtn onClick={() => openEditWallet(w)} label="编辑" color="var(--t2)" />
                          <ActionBtn onClick={() => handleDeleteWallet(w.id)} label="删除" color="var(--red)" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AdminCard>

              {/* 钱包编辑弹窗 */}
              {showWalletModal && (
                <div style={{
                  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
                  zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={e => { if (e.target === e.currentTarget) setShowWalletModal(false); }}>
                  <div style={{
                    background: 'var(--bg2)', border: '1.5px solid var(--border)',
                    borderRadius: 16, padding: '28px 28px', maxWidth: 500, width: '90%', position: 'relative',
                  }}>
                    <button onClick={() => setShowWalletModal(false)} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: 'var(--t3)', fontSize: 20, cursor: 'pointer' }}>×</button>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{editingWallet ? '编辑钱包地址' : '新增钱包地址'}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {[
                        { label: '钱包标签', field: 'label', placeholder: '如：主钱包 / 备用钱包' },
                        { label: 'USDT 地址', field: 'address', placeholder: 'T开头（TRC20）或 0x开头（ERC20）地址' },
                      ].map(({ label, field, placeholder }) => (
                        <div key={field}>
                          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>{label}</div>
                          <input
                            value={String(walletForm[field as keyof PaymentWallet] ?? '')}
                            onChange={e => setWalletForm(prev => ({ ...prev, [field]: e.target.value }))}
                            placeholder={placeholder}
                            style={{ ...inputStyle, width: '100%' }}
                          />
                        </div>
                      ))}
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>网络类型</div>
                        <select value={walletForm.network ?? 'TRC20'} onChange={e => setWalletForm(prev => ({ ...prev, network: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                          {['TRC20', 'ERC20', 'BEP20'].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--t2)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!walletForm.isActive} onChange={e => setWalletForm(prev => ({ ...prev, isActive: e.target.checked }))} />
                          立即展示给用户
                        </label>
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                        <button onClick={handleSaveWallet} style={{
                          flex: 1, padding: '10px 0', borderRadius: 8,
                          background: 'linear-gradient(135deg, #f0b429, #e8920a)',
                          color: '#000', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer',
                        }}>保存</button>
                        <button onClick={() => setShowWalletModal(false)} style={{
                          flex: 1, padding: '10px 0', borderRadius: 8,
                          background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 14,
                        }}>取消</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ════ 查询记录 ════ */}
        {activeTab === 'queries' && (() => {
          const filteredQ = queryList.filter(q => {
            const ms = !querySearch || q.email.includes(querySearch) || q.symbol.includes(querySearch.toUpperCase());
            const mt = queryTfFilter === '全部周期' || q.timeframe === queryTfFilter;
            return ms && mt;
          });
          const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
          return (
            <div>
              <PageTitle title="🔍 查询记录" sub={`共 ${queryList.length} 条 AI 查询日志`} />
              <AdminCard title="最近查询">
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <input value={querySearch} onChange={e => setQuerySearch(e.target.value)} style={{ flex: 1, ...inputStyle }} placeholder="搜索用户邮箱 / 币种..." />
                  <select value={queryTfFilter} onChange={e => setQueryTfFilter(e.target.value)} style={{ ...inputStyle, width: 110 }}>
                    {['全部周期','15m','1h','4h','1d'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                {filteredQ.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: 14 }}>{queryList.length === 0 ? '暂无查询记录' : '无匹配结果'}</div>
                ) : (
                  <AdminTable
                    headers={['用户', '币种', '周期', '方向', '评分', '威科夫阶段', '时间']}
                    rows={filteredQ.map(q => [q.email, q.symbol.replace('USDT','/USDT'), q.timeframe, q.direction, String(q.score), q.phase, fmtTime(q.createdAt)])}
                    renderCell={(val, colIdx) => {
                      if (colIdx === 3) {
                        const color = val.includes('做多') || val.includes('long') ? 'var(--green)' : val.includes('做空') || val.includes('short') ? 'var(--red)' : 'var(--primary)';
                        return <span style={{ color, fontWeight: 700 }}>{val}</span>;
                      }
                      if (colIdx === 4) return <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{val}</span>;
                      return val;
                    }}
                  />
                )}
              </AdminCard>
            </div>
          );
        })()}

        {/* ════ 通知管理 ════ */}
        {activeTab === 'notifications' && (
          <div>
            <PageTitle title="📢 通知管理" sub="手动推送全站公告，前端通知面板实时同步" />

            <AdminCard title="📣 推送新公告">
              <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>推送后所有用户下次打开时在通知面板中看到</div>
              <FormRow label="公告标题">
                <input value={noticeTitle} onChange={e => setNoticeTitle(e.target.value)} style={inputStyle} placeholder="例如：功能更新 / 维护通知 / 新模型上线" />
              </FormRow>
              <FormRow label="公告内容">
                <textarea value={noticeContent} onChange={e => setNoticeContent(e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} placeholder="详细说明，用户在通知面板中展开可读..." />
              </FormRow>
              <FormRow label="通知类型">
                <select value={noticeType} onChange={e => setNoticeType(e.target.value as Notice['type'])} style={inputStyle}>
                  {[['announcement','📢 公告'],['ai_upgrade','🤖 AI模型升级'],['maintenance','⚠️ 维护通知'],['activity','🎁 活动/优惠']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </FormRow>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={async () => {
                  if (!noticeTitle.trim()) { showToast('请填写公告标题'); return; }
                  if (!noticeContent.trim()) { showToast('请填写公告内容'); return; }
                  const result = await pushNotice({ title: noticeTitle, content: noticeContent, type: noticeType });
                  if (!result) { showToast('❌ 推送失败，请稍后重试'); return; }
                  setNoticeTitle(''); setNoticeContent('');
                  void loadNoticesFromDB().then(setNoticeList);
                  showToast('✅ 公告已推送，用户通知面板将显示');
                }} style={{ padding: '9px 22px', borderRadius: 10, background: 'var(--primary)', color: '#fff', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,122,255,0.2)' }}>🚀 立即推送</button>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>推送后不可撤回，请确认内容无误</span>
              </div>
            </AdminCard>

            <AdminCard title={`📋 已推送公告（${noticeList.length} 条）`}>
              {noticeList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: 14 }}>暂无公告记录</div>
              ) : noticeList.slice(0, 20).map(n => (
                <div key={n.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', flex: 1 }}>{n.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>{new Date(n.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>{n.content}</div>
                </div>
              ))}
            </AdminCard>
          </div>
        )}

        {/* ════ 反馈管理 ════ */}
        {activeTab === 'feedback' && (() => {
          const filtered = feedbackList.filter(f => {
            const matchType = fbTypeFilter === '全部类型' || FEEDBACK_TYPE_LABEL[f.type] === fbTypeFilter;
            const statusMap: Record<string, string> = { '待处理': 'pending', '处理中': 'processing', '已解决': 'resolved' };
            const matchStatus = fbStatusFilter === '全部状态' || f.status === statusMap[fbStatusFilter];
            return matchType && matchStatus;
          });
          const pending = feedbackList.filter(f => f.status === 'pending').length;
          const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }); } catch { return iso; } };
          return (
            <div>
              <PageTitle title="💬 反馈管理" sub="查看用户投诉与建议，回复处理并更新状态" />
              <AdminCard title="反馈列表">
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
                  <select value={fbTypeFilter} onChange={e => setFbTypeFilter(e.target.value)} style={{ background: 'var(--bg2)', border: '1.5px solid var(--border)', color: 'var(--t1)', borderRadius: 8, padding: '6px 12px', fontSize: 12, outline: 'none' }}>
                    {['全部类型','🐛 Bug反馈','💡 功能建议','🚨 投诉','💬 其他'].map(o => <option key={o}>{o}</option>)}
                  </select>
                  <select value={fbStatusFilter} onChange={e => setFbStatusFilter(e.target.value)} style={{ background: 'var(--bg2)', border: '1.5px solid var(--border)', color: 'var(--t1)', borderRadius: 8, padding: '6px 12px', fontSize: 12, outline: 'none' }}>
                    {['全部状态','待处理','处理中','已解决'].map(o => <option key={o}>{o}</option>)}
                  </select>
                  <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t3)' }}>共 {feedbackList.length} 条 · {pending} 条待处理</div>
                </div>
                {filtered.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: 14 }}>{feedbackList.length === 0 ? '暂无用户反馈' : '无匹配结果'}</div>
                ) : (
                  <AdminTable
                    headers={['用户', '类型', '内容摘要', '状态', '提交时间', '操作']}
                    rows={filtered.map(f => [f.email, FEEDBACK_TYPE_LABEL[f.type], f.content, f.status, fmtDate(f.createdAt), f.id])}
                    renderCell={(val, colIdx, row) => {
                      if (colIdx === 3) {
                        const s = FEEDBACK_STATUS_LABEL[val as keyof typeof FEEDBACK_STATUS_LABEL] ?? FEEDBACK_STATUS_LABEL.pending;
                        return <StatusBadge label={s.label} color={s.color} bg={s.bg} />;
                      }
                      if (colIdx === 5) {
                        const fb = filtered.find(f => f.id === row[5]);
                        if (!fb) return null;
                        return (
                          <div style={{ display: 'flex', gap: 6 }}>
                            {fb.status === 'pending' && (
                              <ActionBtn onClick={async () => { await updateFeedbackStatus(fb.id, 'processing'); void loadFeedbackFromDB().then(setFeedbackList); showToast('✅ 已受理，状态改为处理中'); }} label="受理" color="var(--primary)" />
                            )}
                            {fb.status === 'processing' && (
                              <ActionBtn onClick={async () => { await updateFeedbackStatus(fb.id, 'resolved'); void loadFeedbackFromDB().then(setFeedbackList); showToast('✅ 已标记为已解决'); }} label="解决" color="var(--green)" />
                            )}
                            {fb.status === 'resolved' && (
                              <StatusBadge label="已处理" color="var(--green)" bg="rgba(0,200,150,0.12)" />
                            )}
                          </div>
                        );
                      }
                      if (colIdx === 2) return <span style={{ fontSize: 12, maxWidth: 200, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>;
                      return val;
                    }}
                  />
                )}
              </AdminCard>
            </div>
          );
        })()}

        {/* ════ 内容编辑 ════ */}
        {activeTab === 'content' && (
          <div>
            <PageTitle title="🎨 前端内容编辑" sub="修改保存后，前端页面实时同步，无需重新部署代码" />

            <AdminCard title="🏠 首页 Hero 区" badge="实时同步">
              <FormRow label="主标题">
                <input value={heroTitle} onChange={e => setHeroTitle(e.target.value)} style={inputStyle} placeholder="主标题文字" />
              </FormRow>
              <FormRow label="副标题">
                <input value={heroSubtitle} onChange={e => setHeroSubtitle(e.target.value)} style={inputStyle} placeholder="副标题文字" />
              </FormRow>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <FormRow label="主按钮文字"><input value={heroCtaText} onChange={e => setHeroCtaText(e.target.value)} style={inputStyle} /></FormRow>
                <FormRow label="副文字"><input value={heroCtaSub} onChange={e => setHeroCtaSub(e.target.value)} style={inputStyle} /></FormRow>
              </div>
              <SaveBtn onClick={() => {
                savePartialContent({ hero: { title: heroTitle, subtitle: heroSubtitle, ctaText: heroCtaText, ctaSubText: heroCtaSub } });
                showToast('✅ Hero区已保存，前端页面已同步');
              }} />
            </AdminCard>

            <AdminCard title="📢 活动Banner" badge="实时同步">
              <FormRow label="Banner文字">
                <input value={bannerText} onChange={e => setBannerText(e.target.value)} style={inputStyle} placeholder="Banner内容" />
              </FormRow>
              <FormRow label="按钮文字">
                <input value={bannerLink} onChange={e => setBannerLink(e.target.value)} style={inputStyle} placeholder="按钮文字" />
              </FormRow>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--t2)' }}>显示Banner</span>
                <button onClick={() => setBannerEnabled(v => !v)} style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: bannerEnabled ? 'var(--green)' : 'var(--border)', position: 'relative', transition: 'background .2s' }}>
                  <span style={{ position: 'absolute', top: 2, left: bannerEnabled ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                </button>
                <span style={{ fontSize: 12, color: bannerEnabled ? 'var(--green)' : 'var(--t3)' }}>{bannerEnabled ? '已开启' : '已关闭'}</span>
              </div>
              <SaveBtn onClick={() => {
                savePartialContent({ banner: { enabled: bannerEnabled, text: bannerText, linkText: bannerLink } });
                showToast('✅ Banner已更新，前端页面已同步');
              }} />
            </AdminCard>
          </div>
        )}

        {/* ════ AI 调教室 ════ */}
        {activeTab === 'training' && (
          <div>
            <PageTitle title="🧠 AI 调教室" sub="编辑 System Prompt、管理知识库、在测试台验证效果" />

            {/* System Prompt */}
            <AdminCard title="📝 System Prompt 编辑">
              <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12 }}>
                此 Prompt 将作为每次 AI 分析请求的系统角色设定，直接影响分析风格与输出格式。
              </div>
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                style={{
                  ...inputStyle, minHeight: 200, resize: 'vertical',
                  fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6,
                }}
              />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>{systemPrompt.length} 字符 · 预计 ~{Math.ceil(systemPrompt.length / 4)} tokens</span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { resetSystemPrompt(); setSystemPrompt(loadSystemPrompt()); showToast('✅ 已重置为默认 Prompt'); }} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 12, cursor: 'pointer' }}>重置默认</button>
                  <SaveBtn onClick={() => { saveSystemPrompt(systemPrompt); showToast('✅ System Prompt 已保存，下次 AI 分析立即生效'); }} label="保存 Prompt" />
                </div>
              </div>
            </AdminCard>

            {/* 知识库 RAG */}
            <AdminCard title="📚 知识库 (RAG)">
              <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>
                上传的文档将被向量化，AI 回答时自动检索相关知识作为参考上下文。
              </div>

              {/* 知识库列表 */}
              <div style={{ marginBottom: 16 }}>
                {kbEntries.map(entry => (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 8,
                    background: 'var(--bg3)', border: '1px solid var(--border)',
                    marginBottom: 8,
                  }}>
                    <span style={{ fontSize: 20 }}>{entry.type === 'pdf' ? '📄' : entry.type === 'json' ? '📊' : '📝'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 500 }}>{entry.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{entry.type.toUpperCase()} · {entry.size} · 更新于 {entry.updated}</div>
                    </div>
                    <StatusBadge label="已向量化" color="var(--green)" bg="rgba(0,200,150,0.12)" />
                    <ActionBtn onClick={() => { setKbEntries(prev => prev.filter(e => e.id !== entry.id)); showToast('已删除'); }} label="删除" color="var(--red)" />
                  </div>
                ))}
              </div>

              {/* 上传区 */}
              <div style={{
                border: '2px dashed var(--border)', borderRadius: 10,
                padding: '24px 20px', textAlign: 'center', cursor: 'pointer',
                background: 'var(--bg1)',
              }} onClick={() => showToast('文件上传功能在生产环境中开放')}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📤</div>
                <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>点击或拖拽上传知识文档</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>支持 .txt · .md · .pdf · .json，单文件最大 5MB</div>
              </div>
            </AdminCard>

            {/* 测试台 */}
            <AdminCard title="🧪 Prompt 测试台">
              <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>
                输入模拟行情数据，测试当前 Prompt + 知识库的 AI 输出效果（使用当前已保存的配置）。
              </div>
              <FormRow label="测试输入（模拟行情数据或问题）">
                <textarea
                  value={testInput}
                  onChange={e => setTestInput(e.target.value)}
                  style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
                  placeholder={`例如：BTC/USDT 1H，当前价格 $63,200，过去24小时成交量 48,000 BTC，RSI=58，MACD金叉，请分析当前威科夫阶段和操作建议。`}
                />
              </FormRow>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <button onClick={handleTestPrompt} disabled={testLoading} style={{
                  padding: '8px 24px', borderRadius: 8, border: 'none', cursor: testLoading ? 'default' : 'pointer',
                  background: testLoading ? 'var(--bg3)' : 'linear-gradient(135deg, #f0b429, #e8920a)',
                  color: testLoading ? 'var(--t3)' : '#000', fontWeight: 700, fontSize: 13,
                }}>
                  {testLoading ? '⏳ AI 分析中...' : '▶ 运行测试'}
                </button>
                {testOutput && <button onClick={() => setTestOutput('')} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 12, cursor: 'pointer' }}>清空结果</button>}
              </div>
              {testOutput && (
                <div style={{
                  background: 'var(--bg1)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: 16,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--primary)', marginBottom: 8, fontWeight: 600 }}>AI 输出结果：</div>
                  <pre style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{testOutput}</pre>
                </div>
              )}
            </AdminCard>
          </div>
        )}

        {/* ════ 模型配置 ════ */}
        {activeTab === 'llmconfig' && (
          <div>
            <PageTitle title="🤖 AI 模型配置" sub="选择 AI Provider、配置 API Key、设置调用参数" />

            {/* Provider 选择 */}
            <AdminCard title="选择 AI Provider">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 4 }}>
                {PROVIDERS.map(p => (
                  <div key={p.key} onClick={() => {
                    setSelectedProvider(p.key);
                    setSelectedModel(p.models[0] ?? '');
                    setApiEndpoint(p.endpoint);
                    setTestConnStatus('idle');
                  }} style={{
                    background: selectedProvider === p.key ? 'rgba(240,180,41,0.08)' : 'var(--bg3)',
                    border: `2px solid ${selectedProvider === p.key ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 10, padding: '12px 8px', textAlign: 'center', cursor: 'pointer', transition: 'all .2s',
                  }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>
                      {p.key === 'deepseek' ? '🔵' : p.key === 'openai' ? '🟢' : p.key === 'zhipu' ? '🟣' : p.key === 'moonshot' ? '🌙' : '⚙️'}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: selectedProvider === p.key ? 'var(--primary)' : 'var(--t2)' }}>{p.label}</div>
                  </div>
                ))}
              </div>
            </AdminCard>

            {/* API 配置 */}
            <AdminCard title={`${currentProvider.label} 配置`}>
              <FormRow label="API Endpoint">
                <input
                  style={inputStyle}
                  value={apiEndpoint}
                  onChange={e => setApiEndpoint(e.target.value)}
                  placeholder="https://api.example.com/v1"
                />
              </FormRow>

              <FormRow label="API Key">
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    style={{ ...inputStyle, paddingRight: 48 }}
                    placeholder="sk-..."
                  />
                  <button onClick={() => setShowKey(v => !v)} style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 14,
                  }}>{showKey ? '🙈' : '👁'}</button>
                </div>
                <div style={{
                  marginTop: 6, padding: '6px 10px', borderRadius: 6,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                  fontSize: 11, color: 'var(--warn)', lineHeight: 1.5,
                }}>
                  ⚠️ API Key 存储于浏览器 localStorage，仅供个人本地使用。<br />
                  生产部署时请改为后端代理架构，避免 Key 泄露。
                </div>
              </FormRow>

              {currentProvider.models.length > 0 && (
                <FormRow label="模型">
                  <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} style={inputStyle}>
                    {currentProvider.models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </FormRow>
              )}

              {currentProvider.key === 'custom' && (
                <FormRow label="模型名称（手动输入）">
                  <input
                    style={inputStyle}
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                    placeholder="例如：gpt-4-turbo-preview"
                  />
                </FormRow>
              )}

              {/* 测试连接 — 调用真实 API */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                <button
                  disabled={testConnStatus === 'testing' || !apiKey.trim()}
                  onClick={async () => {
                    if (!apiKey.trim()) { showToast('请先填写 API Key'); return; }
                    setTestConnStatus('testing');
                    setTestConnMsg('');
                    try {
                      const cfg: LLMConfig = {
                        provider: selectedProvider as LLMConfig['provider'],
                        apiKey: apiKey.trim(),
                        model: currentProvider.key === 'custom' ? customModel : selectedModel,
                        baseUrl: apiEndpoint.trim() || undefined,
                        maxTokens: 10,
                        temperature: 0.1,
                      };
                      await callLLM([{ role: 'user', content: 'hi' }], cfg);
                      setTestConnStatus('ok');
                      setTestConnMsg('');
                    } catch (e: any) {
                      setTestConnStatus('fail');
                      setTestConnMsg(e?.message ?? '未知错误');
                    }
                  }}
                  style={{
                    padding: '8px 20px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg3)',
                    color: 'var(--t1)', fontSize: 13, cursor: testConnStatus === 'testing' ? 'not-allowed' : 'pointer',
                    fontWeight: 600, opacity: !apiKey.trim() ? 0.5 : 1,
                  }}>
                  {testConnStatus === 'testing' ? '⏳ 测试中...' : '🔗 测试连接'}
                </button>
                {testConnStatus === 'ok' && <span style={{ fontSize: 13, color: 'var(--green)' }}>✅ 连接成功</span>}
                {testConnStatus === 'fail' && (
                  <span style={{ fontSize: 12, color: 'var(--red)' }}>
                    ❌ 连接失败{testConnMsg ? `：${testConnMsg.slice(0, 60)}` : '，请检查 Key'}
                  </span>
                )}
              </div>
            </AdminCard>

            {/* 调用参数 */}
            <AdminCard title="⚙️ 调用参数">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <FormRow label="Temperature">
                  <input style={inputStyle} value={temperature} onChange={e => setTemperature(e.target.value)} type="number" min="0" max="2" step="0.1" />
                </FormRow>
                <FormRow label="Max Tokens">
                  <input style={inputStyle} value={maxTokens} onChange={e => setMaxTokens(e.target.value)} type="number" />
                </FormRow>
                <FormRow label="每次查询消耗次数">
                  <input style={inputStyle} value="1" readOnly type="number" min="1" title="固定为1，每次AI查询消耗1次配额" />
                </FormRow>
              </div>
              <FormRow label="超时时间（秒）">
                <input style={{ ...inputStyle, width: 120 }} value="60" readOnly type="number" title="由后端代理控制，前端不可配置" />
              </FormRow>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <SaveBtn
                  onClick={() => {
                    if (!apiKey.trim()) { showToast('请先填写 API Key'); return; }
                    if (testConnStatus !== 'ok') { showToast('请先测试连接成功后再保存'); return; }
                    const cfg: LLMConfig = {
                      provider: selectedProvider as LLMConfig['provider'],
                      apiKey: apiKey.trim(),
                      model: currentProvider.key === 'custom' ? customModel : selectedModel,
                      baseUrl: apiEndpoint.trim() || undefined,
                      maxTokens: parseInt(maxTokens) || 2000,
                      temperature: parseFloat(temperature) || 0.3,
                    };
                    saveLLMConfig(cfg);
                    showToast('✅ 模型配置已保存并生效，下次分析将使用 AI');
                  }}
                  label="保存配置"
                />
                <button
                  onClick={() => {
                    clearLLMConfig();
                    setApiKey('');
                    setTestConnStatus('idle');
                    showToast('已清除模型配置，将使用本地算法');
                  }}
                  style={{
                    padding: '8px 16px', borderRadius: 8, fontSize: 13,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--t3)', cursor: 'pointer',
                  }}>
                  清除配置
                </button>
              </div>
            </AdminCard>
          </div>
        )}

        {/* ════ 系统配置 ════ */}
        {activeTab === 'sysconfig' && (
          <div>
            <PageTitle title="⚙️ 系统配置" sub="全局业务参数配置" />

            <AdminCard title="🎁 注册与邀请奖励">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <FormRow label="注册赠送每日次数">
                  <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    value={sysCfg.freeTrialDailyLimit ?? 5}
                    onChange={e => setSysCfg(p => ({ ...p, freeTrialDailyLimit: Number(e.target.value) }))}
                  />
                </FormRow>
                <FormRow label="注册赠送有效天数">
                  <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    value={sysCfg.freeTrialDays ?? 7}
                    onChange={e => setSysCfg(p => ({ ...p, freeTrialDays: Number(e.target.value) }))}
                  />
                </FormRow>
                <FormRow label="邀请人奖励次数（被邀请人首充后）">
                  <input
                    style={inputStyle}
                    type="number"
                    min={0}
                    value={sysCfg.inviterRewardCredits ?? 10}
                    onChange={e => setSysCfg(p => ({ ...p, inviterRewardCredits: Number(e.target.value) }))}
                  />
                </FormRow>
                <FormRow label="被邀请人奖励次数">
                  <input
                    style={inputStyle}
                    type="number"
                    min={0}
                    value={sysCfg.inviteeRewardCredits ?? 5}
                    onChange={e => setSysCfg(p => ({ ...p, inviteeRewardCredits: Number(e.target.value) }))}
                  />
                </FormRow>
                <FormRow label="邀请奖励上限（次/人）">
                  <input
                    style={inputStyle}
                    type="number"
                    min={0}
                    value={sysCfg.inviteRewardCap ?? 500}
                    onChange={e => setSysCfg(p => ({ ...p, inviteRewardCap: Number(e.target.value) }))}
                  />
                </FormRow>
              </div>
              <SaveBtn onClick={() => { saveSysConfig(sysCfg); showToast('✅ 奖励配置已保存'); }} />
            </AdminCard>

            <AdminCard title="🔒 安全与限流">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <FormRow label="登录失败锁定阈值（次）">
                  <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    value={sysCfg.loginLockThreshold ?? 5}
                    onChange={e => setSysCfg(p => ({ ...p, loginLockThreshold: Number(e.target.value) }))}
                  />
                </FormRow>
                <FormRow label="锁定时长（分钟）">
                  <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    value={sysCfg.loginLockMinutes ?? 30}
                    onChange={e => setSysCfg(p => ({ ...p, loginLockMinutes: Number(e.target.value) }))}
                  />
                </FormRow>
                <FormRow label="API 次数限速（次/分钟/IP）">
                  <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    value={sysCfg.apiRateLimitPerMin ?? 60}
                    onChange={e => setSysCfg(p => ({ ...p, apiRateLimitPerMin: Number(e.target.value) }))}
                  />
                </FormRow>
                <FormRow label="AI查询限速（次/小时/用户）">
                  <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    value={sysCfg.aiQueryLimitPerHour ?? 100}
                    onChange={e => setSysCfg(p => ({ ...p, aiQueryLimitPerHour: Number(e.target.value) }))}
                  />
                </FormRow>
              </div>
              <SaveBtn onClick={() => { saveSysConfig(sysCfg); showToast('✅ 安全配置已保存'); }} />
            </AdminCard>

            {/* 基础设置 — 真实读写 sysConfigStore */}
            <AdminCard title="🌐 基础设置">
              <FormRow label="站点名称">
                <input style={inputStyle} value={sysCfg.siteName} onChange={e => setSysCfg(p => ({ ...p, siteName: e.target.value }))} />
              </FormRow>
              <FormRow label="客服邮箱">
                <input style={inputStyle} value={sysCfg.supportEmail} onChange={e => setSysCfg(p => ({ ...p, supportEmail: e.target.value }))} type="email" />
              </FormRow>
              <FormRow label="客服微信号（选填）">
                <input style={inputStyle} value={sysCfg.supportWeChat ?? ''} onChange={e => setSysCfg(p => ({ ...p, supportWeChat: e.target.value }))} placeholder="填写后将在订阅页展示" />
              </FormRow>
              <FormRow label="客服响应说明（选填）">
                <input style={inputStyle} value={sysCfg.supportNote ?? ''} onChange={e => setSysCfg(p => ({ ...p, supportNote: e.target.value }))} placeholder="如：工作日9-18时响应" />
              </FormRow>
              <FormRow label="审核时效说明">
                <input style={inputStyle} value={sysCfg.reviewTimeNote} onChange={e => setSysCfg(p => ({ ...p, reviewTimeNote: e.target.value }))} placeholder="如：工作日 2 小时内审核" />
              </FormRow>
              <FormRow label="转账提示（付款步骤钱包地址下方，每行一条）">
                <textarea
                  style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                  value={sysCfg.paymentNote ?? ''}
                  onChange={e => setSysCfg(p => ({ ...p, paymentNote: e.target.value }))}
                  placeholder="📌/📧/⚠️ 开头的行会自动高亮，动态的网络/金额/邮箱由系统自动填入"
                />
              </FormRow>
              <FormRow label="订阅说明（显示在付款步骤，每行一条）">
                <textarea
                  style={{ ...inputStyle, minHeight: 100, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                  value={sysCfg.subscriptionNote}
                  onChange={e => setSysCfg(p => ({ ...p, subscriptionNote: e.target.value }))}
                  placeholder="每行填写一条说明，以 • 开头或直接写文字均可"
                />
              </FormRow>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14 }}>
                💡 以上内容保存后，用户订阅页「订阅说明」区域立即更新
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: 'var(--t2)' }}>开放注册</span>
                <ToggleSwitch defaultOn={sysCfg.registrationOpen} />
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>关闭后新用户无法注册</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: 'var(--t2)' }}>维护模式</span>
                <ToggleSwitch defaultOn={sysCfg.maintenanceMode} />
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>开启后前台显示维护页面</span>
              </div>
              <SaveBtn onClick={handleSaveSys} />
            </AdminCard>
          </div>
        )}

        {/* ════ 管理员账号 ════ */}
        {activeTab === 'admins' && (
          <div>
            <PageTitle title="🔐 管理员账号" sub="管理后台访问人员及权限" />

            <AdminCard title="管理员列表">
              {adminsLoading ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--t3)', fontSize: 13 }}>加载中...</div>
              ) : admins.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--t3)', fontSize: 13 }}>暂无管理员，点击下方按钮添加</div>
              ) : admins.map((admin, i) => {
                const roleInfo = ROLE_DISPLAY[admin.role] ?? ROLE_DISPLAY.custom;
                return (
                  <div key={admin.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 0', borderBottom: i < admins.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 15, fontWeight: 700,
                      background: roleInfo.bg, color: roleInfo.color,
                    }}>{(admin.name || admin.email || '?')[0].toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{admin.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{admin.email}</div>
                    </div>
                    <StatusBadge label={roleInfo.label} color={roleInfo.color} bg={roleInfo.bg} />
                    <ActionBtn onClick={() => openEditModal(admin)} label="编辑权限" />
                    <ActionBtn onClick={async () => {
                      const uid = (admin as any).uid;
                      if (!uid) { showToast('无法获取用户ID'); return; }
                      const { error } = await supabase.from('profiles').update({ is_admin: false }).eq('uid', uid);
                      if (error) { showToast('❌ 删除失败：' + error.message); return; }
                      showToast('✅ 已移除管理员权限');
                      void loadAdmins();
                    }} label="移除权限" color="var(--red)" />
                  </div>
                );
              })}
              <button onClick={() => openEditModal(null)} style={{
                marginTop: 14, padding: '9px 0', width: '100%', borderRadius: 8,
                fontSize: 13, border: '1px dashed var(--border)',
                background: 'transparent', color: 'var(--t3)', cursor: 'pointer',
              }}>+ 添加管理员</button>
            </AdminCard>

            {/* 角色说明 */}
            <AdminCard title="角色权限说明">
              {Object.entries(ROLE_DISPLAY).map(([key, info]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(30,45,66,0.4)' }}>
                  <StatusBadge label={info.label} color={info.color} bg={info.bg} />
                  <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>
                    {key === 'super_admin' && '拥有所有权限，包括管理员账号管理和系统配置'}
                    {key === 'ops' && '可访问数据概览、用户管理、充值管理、查询记录、通知管理、反馈管理'}
                    {key === 'content_admin' && '仅可访问数据概览、内容编辑、通知管理'}
                    {key === 'custom' && '自定义权限，可精确勾选各模块访问权限'}
                  </div>
                </div>
              ))}
            </AdminCard>
          </div>
        )}
      </main>

      {/* ── 管理员编辑弹窗 ── */}
      {showAdminModal && editAdmin && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
          zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={e => { if (e.target === e.currentTarget) setShowAdminModal(false); }}>
          <div style={{
            background: 'var(--bg2)', border: '1.5px solid var(--border)',
            borderRadius: 18, padding: '32px 28px', maxWidth: 500, width: '92%',
            position: 'relative', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <button onClick={() => setShowAdminModal(false)} style={{
              position: 'absolute', top: 14, right: 16, background: 'none', border: 'none',
              color: 'var(--t3)', fontSize: 22, cursor: 'pointer',
            }}>×</button>

            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 22 }}>
              {admins.find(a => a.id === editAdmin.id) ? '编辑管理员' : '添加管理员'}
            </div>

            <FormRow label="姓名 / 昵称">
              <input style={inputStyle} value={editAdmin.name} onChange={e => setEditAdmin({ ...editAdmin, name: e.target.value })} placeholder="例如：运营小李" />
            </FormRow>
            <FormRow label="登录邮箱">
              <input style={inputStyle} value={editAdmin.email} type="email" onChange={e => setEditAdmin({ ...editAdmin, email: e.target.value })} placeholder="admin@wyckoff.pro" />
            </FormRow>

            <FormRow label="角色">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {(['super_admin', 'ops', 'content_admin', 'custom'] as const).map(role => {
                  const info = ROLE_DISPLAY[role];
                  return (
                    <div key={role} onClick={() => setEditAdmin({ ...editAdmin, role })} style={{
                      border: `2px solid ${editAdmin.role === role ? info.color : 'var(--border)'}`,
                      background: editAdmin.role === role ? info.bg : 'var(--bg3)',
                      borderRadius: 8, padding: '8px 6px', textAlign: 'center', cursor: 'pointer',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: editAdmin.role === role ? info.color : 'var(--t2)' }}>{info.label}</div>
                    </div>
                  );
                })}
              </div>
            </FormRow>

            {/* 自定义权限勾选 */}
            {editAdmin.role === 'custom' && (
              <FormRow label="自定义权限">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {PERMISSION_LABELS.map(perm => {
                    const checked = editAdmin.customPerms.includes(perm.key);
                    return (
                      <div key={perm.key} onClick={() => setEditAdmin({
                        ...editAdmin,
                        customPerms: checked
                          ? editAdmin.customPerms.filter(k => k !== perm.key)
                          : [...editAdmin.customPerms, perm.key],
                      })} style={{
                        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                        padding: '6px 8px', borderRadius: 6,
                        background: checked ? 'rgba(240,180,41,0.08)' : 'var(--bg3)',
                        border: `1px solid ${checked ? 'rgba(240,180,41,0.4)' : 'var(--border)'}`,
                      }}>
                        <div style={{
                          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                          border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                          background: checked ? 'var(--primary)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {checked && <span style={{ fontSize: 9, color: '#000', fontWeight: 900 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 11, color: checked ? 'var(--t1)' : 'var(--t2)' }}>{perm.label}</span>
                      </div>
                    );
                  })}
                </div>
              </FormRow>
            )}

            {/* 非自定义角色显示权限预览 */}
            {editAdmin.role !== 'custom' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 8 }}>该角色拥有以下权限：</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {getEffectivePerms(editAdmin).map(k => {
                    const label = PERMISSION_LABELS.find(p => p.key === k)?.label ?? k;
                    return <span key={k} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, background: 'rgba(240,180,41,0.1)', color: 'var(--primary)', border: '1px solid rgba(240,180,41,0.25)' }}>{label}</span>;
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={() => setShowAdminModal(false)} style={{ flex: 1, padding: 11, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 13, cursor: 'pointer' }}>取消</button>
              <button onClick={handleSaveAdmin} style={{ flex: 2, padding: 11, borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #f0b429, #e8920a)', color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-bar">{toast}</div>
      )}
    </div>
  );
}

// ── 共用子组件 ──

function PageTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', marginBottom: 4, letterSpacing: '-0.3px' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--t3)' }}>{sub}</div>
    </div>
  );
}

function AdminCard({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border-light)', borderRadius: 16, padding: '18px 20px', marginBottom: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
        {title}
        {badge && <span style={{ fontSize: 10, background: 'rgba(0,122,255,0.1)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function AdminTable({ headers, rows, renderCell }: {
  headers: string[];
  rows: (string | null)[][];
  renderCell?: (val: string, colIdx: number, row: (string | null)[]) => React.ReactNode;
}) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border-light)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg3)' }}>
            {headers.map(h => <th key={h} style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'left', padding: '9px 14px', borderBottom: '1px solid var(--border-light)', fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ transition: 'background .1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,255,0.03)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
            >
              {row.map((cell, ci) => (
                <td key={ci} style={{ fontSize: 13, padding: '11px 14px', borderBottom: ri < rows.length - 1 ? '1px solid var(--border-light)' : 'none', color: 'var(--t1)' }}>
                  {renderCell ? renderCell(cell ?? '', ci, row) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--t2)', marginBottom: 6, display: 'block' }}>{label}</label>
      {children}
    </div>
  );
}

function SaveBtn({ onClick, label = '保存并同步到前端' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} style={{ padding: '9px 22px', borderRadius: 10, background: 'var(--primary)', color: '#fff', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,122,255,0.2)', transition: 'all .15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}
    >
      {label}
    </button>
  );
}

function StatusBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' }}>{label}</span>
  );
}

function ActionBtn({ onClick, label, color = 'var(--t3)' }: { onClick: () => void; label: string; color?: string }) {
  return (
    <button onClick={onClick} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 500, border: `1px solid ${color}`, background: 'transparent', color, cursor: 'pointer', transition: 'all .12s', whiteSpace: 'nowrap' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.75'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >{label}</button>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10, boxSizing: 'border-box',
  border: '1px solid var(--border)', background: 'var(--bg2)',
  color: 'var(--t1)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
  transition: 'border-color .15s, box-shadow .15s',
};

function ToggleSwitch({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = React.useState(defaultOn);
  return (
    <button
      onClick={() => setOn(v => !v)}
      style={{
        width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: on ? 'var(--primary)' : 'var(--border)',
        position: 'relative', transition: 'background .2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 20 : 2,
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left .2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}
