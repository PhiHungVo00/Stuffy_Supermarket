import React from 'react';
import AISearchBar from './AISearchBar';
import NotificationBell from './NotificationBell';
import SimpleSearchBar from './SimpleSearchBar';
import LanguageSwitcher from './LanguageSwitcher';
// @ts-ignore
import { cartCount } from 'store/signals';
// @ts-ignore
import { useI18nStore } from 'store/i18n';

export default function Header() {
  const { t } = useI18nStore();
  const [showDropdown, setShowDropdown] = React.useState(false);

  // Read user from localStorage
  const savedUser = typeof window !== 'undefined' ? localStorage.getItem('userInfo') : null;
  const user = savedUser ? JSON.parse(savedUser) : null;

  const getInitials = (name) => {
    if (!name) return '👤';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  };

  const initials = user ? getInitials(user.name) : '👤';

  const handleLogout = () => {
    localStorage.removeItem('userInfo');
    window.location.href = '/login';
  };

  const navigateTo = (path) => {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <header style={{
      background: 'rgba(255, 255, 255, 0.85)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border-light)',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      padding: '12px 40px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.03)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
        <div 
          onClick={() => navigateTo('/')}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
        >
          <div style={{ width: '45px', height: '45px', background: 'var(--primary-color)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '900', fontSize: '1.4rem' }}>
            S
          </div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '800', letterSpacing: '-0.5px', color: 'var(--text-main)' }}>
            Stuffy<span style={{ color: 'var(--secondary-color)' }}>Market</span>
          </h1>
        </div>

        {/* 🔍 Thanh Tìm Kiếm Standard (Real-time) */}
        <SimpleSearchBar />
      </div>

      {/* 🤖 Thanh Tìm Kiếm AI thay thế ô search tĩnh */}
      <AISearchBar />

      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <span 
          role="button"
          tabIndex={0}
          aria-label={t('support')}
          style={{ fontWeight: '600', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          {t('support')}
        </span>
        
        {/* Notification Bell Component */}
        <NotificationBell />
        
        {/* 🌎 Integrated Theme Switcher (Shared DS MFE) */}
        <div style={{ display: 'flex', gap: '8px', marginRight: '10px' }}>
          {['default', 'emerald', 'midnight'].map(themeName => (
            <button 
                key={themeName}
                onClick={() => {
                  try {
                    // @ts-ignore
                    const { applyTheme } = require('design_system/ThemeConfig');
                    applyTheme(themeName);
                  } catch (e) {
                    console.warn("ThemeConfig service unavailable.");
                  }
                }}
                title={`Switch to ${themeName} theme`}
                aria-label={`Switch to ${themeName} theme`}
                style={{ 
                  width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  background: themeName === 'default' ? '#6366f1' : themeName === 'emerald' ? '#10b981' : '#a855f7',
                  position: 'relative'
                }}
            >
              <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }}>
                {themeName} theme
              </span>
            </button>
          ))}
        </div>

        {/* Sync i18n Switcher */}
        <LanguageSwitcher />

        {/* 🛒 Elite Cross-MFE Cart Badge (Signals) */}
        <button 
          onClick={() => navigateTo('/cart')}
          aria-label="Shopping Cart"
          style={{ 
            position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '45px', height: '45px', background: '#f8fafc', borderRadius: '14px',
            border: '1px solid #e2e8f0', color: '#1e293b', padding: 0 
          }}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          {cartCount.value > 0 && (
            <div style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'var(--primary-color)', color: 'white', fontSize: '0.75rem', fontWeight: '900', padding: '1px 7px', borderRadius: '50%', border: '2px solid white', boxShadow: '0 2px 4px rgba(99, 102, 241, 0.4)' }}>
              {cartCount.value}
            </div>
          )}
        </button>
        
        <div style={{ position: 'relative' }}>
          <div 
            onClick={() => setShowDropdown(!showDropdown)}
            style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', color: '#9a3412', border: '2px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', marginLeft: '10px', cursor: 'pointer' }}
          >
            {initials}
          </div>
          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '55px',
              right: 0,
              background: 'white',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-lg)',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              zIndex: 9999,
              minWidth: '180px'
            }}>
              {user ? (
                <>
                  <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-light)', marginBottom: '4px' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{user.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{user.email}</div>
                  </div>
                  <button 
                    onClick={() => { setShowDropdown(false); navigateTo('/profile'); }}
                    style={{ background: 'transparent', border: 'none', padding: '8px', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-main)', borderRadius: '6px', width: '100%', transition: 'all 0.2s' }}
                    onMouseOver={e => e.target.style.background = '#f1f5f9'}
                    onMouseOut={e => e.target.style.background = 'transparent'}
                  >
                    👤 {t('profile') || 'Trang cá nhân'}
                  </button>
                  <button 
                    onClick={handleLogout}
                    style={{ background: 'transparent', border: 'none', padding: '8px', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem', color: '#ef4444', borderRadius: '6px', width: '100%', transition: 'all 0.2s' }}
                    onMouseOver={e => e.target.style.background = '#fef2f2'}
                    onMouseOut={e => e.target.style.background = 'transparent'}
                  >
                    🚪 {t('logout') || 'Đăng xuất'}
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => { setShowDropdown(false); window.location.href = '/login'; }}
                  style={{ background: 'var(--primary-color)', color: 'white', border: 'none', padding: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', borderRadius: '8px', width: '100%' }}
                >
                  🔑 {t('login') || 'Đăng nhập'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
