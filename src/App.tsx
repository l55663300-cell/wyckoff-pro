import { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import LandingPage from './pages/LandingPage';
import { LoginModal } from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AppPage from './pages/AppPage';
import UserPage from './pages/UserPage';
import RechargePage from './pages/RechargePage';
import AdminPage from './pages/AdminPage';

export default function App() {
  const { page, navigate } = useApp();

  // Modal 完全用本地 state 控制，与全局路由 page 彻底解耦
  const [showLoginModal, setShowLoginModal] = useState(false);

  // 启动时检测 URL ?reset_token=xxx，自动跳到重置密码页
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset_token');
    if (token) {
      // 用 sessionStorage 中转 token 给 ResetPasswordPage，再清除 URL
      sessionStorage.setItem('pending_reset_token', token);
      window.history.replaceState({}, '', window.location.pathname);
      navigate('resetPassword');
    }
  }, [navigate]);

  // 用 display:none 而非条件渲染，保持 AppPage 始终挂载
  const show = (p: typeof page) => ({ style: { display: page === p ? undefined : 'none' } });

  // landing 和 login（兼容旧路由）时都显示首页
  const showLanding = page === 'landing' || page === 'login';

  return (
    <>
      <div style={{ display: showLanding ? undefined : 'none' }}>
        <LandingPage onOpenLogin={() => setShowLoginModal(true)} />
      </div>
      <div {...show('app')}><AppPage /></div>
      <div {...show('user')}><UserPage /></div>
      <div {...show('recharge')}><RechargePage /></div>
      <div {...show('admin')}><AdminPage /></div>

      {/* 重置密码页（独立全屏页，不是 Modal） */}
      {page === 'resetPassword' && <ResetPasswordPage />}

      {/* 登录/注册 Modal：在最外层独立渲染，点×直接关闭 */}
      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </>
  );
}
