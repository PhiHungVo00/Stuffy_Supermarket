import React from 'react';
// @ts-ignore
import { useI18nStore } from "store/i18n";

export default function LanguageSwitcher() {
  const { lang, setLang } = useI18nStore();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: 'rgba(0,0,0,0.05)',
      borderRadius: '99px',
      padding: '4px',
      gap: '2px'
    }}>
      <button 
        onClick={() => setLang('en')}
        aria-label="EN - Switch to English"
        style={{
          border: 'none',
          background: lang === 'en' ? 'white' : 'transparent',
          color: lang === 'en' ? 'var(--primary-dark)' : '#475569',
          padding: '6px 12px',
          borderRadius: '99px',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: lang === 'en' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
          transition: 'all 0.2s ease'
        }}
      >
        EN
      </button>
      <button 
        onClick={() => setLang('vi')}
        aria-label="VN - Chuyển sang tiếng Việt"
        style={{
          border: 'none',
          background: lang === 'vi' ? 'white' : 'transparent',
          color: lang === 'vi' ? 'var(--primary-dark)' : '#475569',
          padding: '6px 12px',
          borderRadius: '99px',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: lang === 'vi' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
          transition: 'all 0.2s ease'
        }}
      >
        VN
      </button>
    </div>
  );
}
