import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import { useI18nStore } from 'store/i18n';

const SimpleSearchBar = () => {
  const { t } = useI18nStore();
  const [query, setQuery] = useState('');
  const debounceRef = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    debounceRef.current = setTimeout(() => {
      // Bắn sự kiện ra toàn hệ thống
      window.dispatchEvent(new CustomEvent('PRODUCT_SEARCH', { 
        detail: { keyword: val } 
      }));
    }, 300); // Debounce 300ms
  };

  return (
    <div style={{ position: 'relative', width: '300px' }}>
      <input
        type="text"
        placeholder={t('search_placeholder')}
        value={query}
        onChange={handleChange}
        style={{
          width: '100%',
          padding: '10px 15px 10px 40px',
          borderRadius: '12px',
          border: '1px solid var(--border-light)',
          background: '#f8fafc',
          outline: 'none',
          fontSize: '0.9rem',
          transition: 'all 0.2s',
        }}
        onFocus={(e) => e.target.style.borderColor = 'var(--primary-color)'}
        onBlur={(e) => e.target.style.borderColor = 'var(--border-light)'}
      />
      <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
    </div>
  );
};

export default SimpleSearchBar;
