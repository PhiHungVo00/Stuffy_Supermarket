import React, { useState, useEffect } from "react";
// @ts-ignore
import { useI18nStore } from "store/i18n";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';

export default function VoucherWallet() {
  const { t } = useI18nStore();
  const [vouchers, setVouchers] = useState([]);
  const [claimed, setClaimed] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/vouchers`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setVouchers(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setVouchers([
          { _id: '1', code: 'FREESHIP', type: 'shipping', discountValue: 0, description: 'Free shipping on orders over $50', expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() },
          { _id: '2', code: 'TECH10', type: 'discount', discountType: 'percentage', discountValue: 10, description: '10% off on all tech products', expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() },
          { _id: '3', code: 'WELCOME15', type: 'discount', discountType: 'fixed', discountValue: 15, description: '$15 off your first purchase', expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        setLoading(false);
      });
  }, []);

  const getToken = () => {
    try { return JSON.parse(localStorage.getItem('userInfo') || '{}').token || ''; } catch { return ''; }
  };

  const handleClaim = async (voucher) => {
    const token = getToken();
    if (!token) {
      alert(t('login_to_claim'));
      return;
    }
    if (claimed.includes(voucher._id)) return;

    try {
      const res = await fetch(`${API_BASE}/api/vouchers/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: voucher.code })
      });
      const data = await res.json();
      if (res.ok) {
        setClaimed([...claimed, voucher._id]);
        window.dispatchEvent(new CustomEvent('STUFFY_TOAST', {
          detail: { message: `Voucher ${voucher.code} ${t('claimed').toLowerCase()}`, type: 'success' }
        }));
      } else {
        if (data.error?.includes('already claimed')) {
          setClaimed([...claimed, voucher._id]);
        }
        alert(data.error || 'Failed to claim');
      }
    } catch (e) {
      setClaimed([...claimed, voucher._id]);
    }
  };

  const getTimeLeft = (expiresAt) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return t('expired');
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const getValueDisplay = (v) => {
    if (v.type === 'shipping') return [t('free'), t('ship_badge')];
    if (v.discountType === 'percentage') return [`${v.discountValue}%`, t('off_badge')];
    return [`$${v.discountValue}`, t('off_badge')];
  };

  if (loading) return null;

  return (
    <div style={{ background: 'white', borderRadius: '24px', padding: '30px', boxShadow: '0 10px 40px rgba(0,0,0,0.03)', border: '1px solid var(--border-light)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>🎟️</span> {t('my_voucher_wallet')}
        </h3>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{vouchers.length} {t('vouchers_available')}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {vouchers.map(v => {
          const isClaimed = claimed.includes(v._id);
          const [val1, val2] = getValueDisplay(v);
          return (
            <div key={v._id} style={{ display: 'flex', border: '1px solid', borderColor: isClaimed ? '#e2e8f0' : '#c7d2fe', borderRadius: '12px', overflow: 'hidden', opacity: isClaimed ? 0.6 : 1, transition: 'all 0.3s' }}>
              
              <div style={{ background: isClaimed ? '#f1f5f9' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: isClaimed ? '#94a3b8' : 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px 15px', minWidth: '90px', borderRight: '2px dashed', borderRightColor: isClaimed ? '#cbd5e1' : 'rgba(255,255,255,0.4)', position: 'relative' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: '900', lineHeight: 1 }}>{val1}</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{val2}</span>
                
                <div style={{ position: 'absolute', top: '-8px', right: '-8px', width: '16px', height: '16px', borderRadius: '50%', background: 'white' }}></div>
                <div style={{ position: 'absolute', bottom: '-8px', right: '-8px', width: '16px', height: '16px', borderRadius: '50%', background: 'white' }}></div>
              </div>

              <div style={{ padding: '15px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: isClaimed ? '#f8fafc' : 'white' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>{v.type}</div>
                  <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '1rem', lineHeight: 1.2 }}>{v.description}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Code: {v.code}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '15px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: '700' }}>⏰ {getTimeLeft(v.expiresAt)}</div>
                  <button 
                    onClick={() => handleClaim(v)}
                    disabled={isClaimed}
                    style={{ background: isClaimed ? 'transparent' : '#fef2f2', color: isClaimed ? '#94a3b8' : '#ef4444', border: isClaimed ? 'none' : '1px solid #fecaca', padding: '5px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: isClaimed ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                  >
                    {isClaimed ? t('claimed') : t('claim_now')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
