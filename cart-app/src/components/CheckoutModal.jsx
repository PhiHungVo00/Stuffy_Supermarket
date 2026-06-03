import React, { useState } from "react";
// @ts-ignore
import { useI18nStore } from "store/i18n";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';

export default function CheckoutModal({ total, breakdown, onCheckout, onClose }) {
  const { t } = useI18nStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [shipping, setShipping] = useState({
    address: "",
    city: "",
    postalCode: "",
    country: ""
  });
  
  const [payment, setPayment] = useState({
    name: "",
    cardNumber: "",
    expiry: "",
    cvc: ""
  });

  const handleNext = (e) => {
    e.preventDefault();
    if (step === 1) {
      if (shipping.address && shipping.city && shipping.postalCode && shipping.country) {
        setStep(2);
      } else {
        alert(t('fill_shipping_alert'));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!payment.name || !payment.cardNumber || !payment.expiry || !payment.cvc) {
      alert(t('fill_payment_alert'));
      return;
    }
    
    setLoading(true);
    try {
      const idempotencyKey = 'idemp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      const res = await fetch(`${API_BASE}/api/payments/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey
        },
        body: JSON.stringify({ amount: total, currency: 'usd' })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Payment initiation failed");
      }
      
      await onCheckout(shipping);
    } catch (err) {
      alert("Lỗi thanh toán: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '12px 15px', borderRadius: '8px', border: '1px solid var(--border-light)', outline: 'none', marginBottom: '15px' };
  const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-muted)' };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div className="ds-glass-card" style={{ width: '100%', maxWidth: '500px', background: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '15px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800' }}>{t('secure_checkout')}</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('step_of', { step, name: step === 1 ? t('shipping_info') : t('payment_details') })}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-muted)' }}>✕</button>
        </div>

        {/* Total Badge / Itemized breakdown */}
        {breakdown ? (
          <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              <span>{t('subtotal')}:</span>
              <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>${breakdown.subtotal.toFixed(2)}</span>
            </div>
            {breakdown.shopDiscounts > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#16a34a' }}>
                <span>{t('shop_discounts')}:</span>
                <span style={{ fontWeight: '600' }}>-${breakdown.shopDiscounts.toFixed(2)}</span>
              </div>
            )}
            {breakdown.spinDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#16a34a' }}>
                <span>{t('wheel_discount')}:</span>
                <span style={{ fontWeight: '600' }}>-${breakdown.spinDiscount.toFixed(2)}</span>
              </div>
            )}
            {breakdown.platformDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#16a34a' }}>
                <span>{t('platform_discount')}:</span>
                <span style={{ fontWeight: '600' }}>-${breakdown.platformDiscount.toFixed(2)}</span>
              </div>
            )}
            {breakdown.coinsDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#16a34a' }}>
                <span>{t('coins_discount')}:</span>
                <span style={{ fontWeight: '600' }}>-${breakdown.coinsDiscount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              <span>{t('shipping')}:</span>
              <span style={{ fontWeight: '600', color: breakdown.shipping === 0 ? '#16a34a' : 'var(--text-main)' }}>
                {breakdown.shipping === 0 ? t('free') : `$${breakdown.shipping.toFixed(2)}`}
              </span>
            </div>
            <div style={{ borderTop: '1px dashed var(--border-light)', margin: '5px 0' }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{t('final_total')}:</span>
              <span style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--primary-color)' }}>${total.toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <div style={{ background: '#f8fafc', padding: '12px 15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-light)' }}>
            <span style={{ fontWeight: '600', color: 'var(--text-muted)' }}>{t('total')}:</span>
            <span style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--primary-color)' }}>${total.toFixed(2)}</span>
          </div>
        )}

        {/* Content */}
        {step === 1 ? (
          <form onSubmit={handleNext}>
            <label style={labelStyle}>{t('street_address')}</label>
            <input type="text" placeholder="123 Main St" value={shipping.address} onChange={(e) => setShipping({...shipping, address: e.target.value})} style={inputStyle} required />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={labelStyle}>{t('city')}</label>
                <input type="text" placeholder="New York" value={shipping.city} onChange={(e) => setShipping({...shipping, city: e.target.value})} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>{t('postal_code')}</label>
                <input type="text" placeholder="10001" value={shipping.postalCode} onChange={(e) => setShipping({...shipping, postalCode: e.target.value})} style={inputStyle} required />
              </div>
            </div>

            <label style={labelStyle}>{t('country')}</label>
            <input type="text" placeholder="United States" value={shipping.country} onChange={(e) => setShipping({...shipping, country: e.target.value})} style={inputStyle} required />

            <button type="submit" className="ds-button" style={{ width: '100%', padding: '14px', marginTop: '10px' }}>
              {t('continue_to_payment')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.85rem', color: '#b91c1c', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.2rem' }}>💳</span>
              <span>{t('test_mode_notice')}</span>
            </div>

            <label style={labelStyle}>{t('name_on_card')}</label>
            <input type="text" placeholder="John Doe" value={payment.name} onChange={(e) => setPayment({...payment, name: e.target.value})} style={inputStyle} required />

            <label style={labelStyle}>{t('card_number')}</label>
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="4242 4242 4242 4242" maxLength={19} value={payment.cardNumber} onChange={(e) => setPayment({...payment, cardNumber: e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim()})} style={{...inputStyle, paddingLeft: '40px', fontFamily: 'monospace', fontSize: '1.1rem'}} required />
              <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" alt="Visa" style={{ position: 'absolute', top: '15px', left: '12px', height: '12px', opacity: 0.5 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={labelStyle}>{t('expiry')}</label>
                <input type="text" placeholder="12/26" maxLength={5} value={payment.expiry} onChange={(e) => setPayment({...payment, expiry: e.target.value})} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>{t('cvc')}</label>
                <input type="text" placeholder="123" maxLength={4} value={payment.cvc} onChange={(e) => setPayment({...payment, cvc: e.target.value})} style={inputStyle} required />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" onClick={() => setStep(1)} style={{ padding: '14px 20px', background: '#f1f5f9', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                {t('back')}
              </button>
              <button type="submit" disabled={loading} style={{ flex: 1, padding: '14px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? t('processing_stripe') : t('pay_amount', { amount: total.toFixed(2) })}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
