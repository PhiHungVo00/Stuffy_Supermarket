import React from "react";
import { useWishlistStore, useCartStore } from "store/store";
import Button from "design_system/Button";
// @ts-ignore
import { useI18nStore } from "store/i18n";

export default function WishlistPage() {
  const { t } = useI18nStore();
  const { wishlist, toggleWishlist } = useWishlistStore();
  const addToCart = useCartStore((state) => state.addToCart);

  if (wishlist.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ fontSize: '5rem', opacity: 0.15, marginBottom: '20px' }}>❤️</div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '10px' }}>{t('wishlist_empty')}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>{t('wishlist_empty_desc')}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0 0 6px 0' }}>{t('my_wishlist')}</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>{wishlist.length} {wishlist.length === 1 ? t('item_saved') : t('items_saved')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '25px' }}>
        {wishlist.map(product => (
          <div key={product.id} style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', border: '1px solid var(--border-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', transition: 'transform 0.2s, box-shadow 0.2s' }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.08)'; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)'; }}
          >
            <div style={{ position: 'relative', background: '#f8fafc', padding: '20px', textAlign: 'center' }}>
              <img src={product.image} alt={product.name} loading="lazy" decoding="async" style={{ width: '140px', height: '140px', objectFit: 'contain' }} />
              <button
                onClick={() => toggleWishlist(product)}
                aria-label="Xóa khỏi danh sách yêu thích"
                style={{ position: 'absolute', top: '12px', right: '12px', background: 'white', border: 'none', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
              >
                ❤️
              </button>
            </div>
            <div style={{ padding: '18px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>{product.category}</div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>{product.name}</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--primary-color)' }}>${product.price}</span>
                <Button onClick={() => addToCart(product)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                  {t('add_to_cart')}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
