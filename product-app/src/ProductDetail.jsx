import React, { useState, useEffect } from "react";
// react-router-dom import removed to bypass MFE context errors
import { useCartStore, useWishlistStore } from "store/store";
import { productApi } from "store/api";
import Button from "design_system/Button";
// @ts-ignore
import { useI18nStore } from "store/i18n";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';

// Lazy-load the 3D viewer (2MB+) — only fetched when user clicks "View in 3D"
const Viewer3D = React.lazy(() => import("viewer/Viewer"));

export default function ProductDetail() {
  const { t } = useI18nStore();
  const id = window.location.pathname.split('/').pop();
  const navigate = (path) => window.dispatchEvent(new CustomEvent('STUFFY_NAV', { detail: { path } }));
  const addToCart = useCartStore((state) => state.addToCart);
  const { wishlist, toggleWishlist } = useWishlistStore();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [recommendedProducts, setRecommendedProducts] = useState([]);
  
  // Customization State
  const [selectedColor, setSelectedColor] = useState("#6366f1");
  const [show3DViewer, setShow3DViewer] = useState(false);

  // Review Formulation State
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(null);
  
  // Verified Buyer State
  const [isVerifiedBuyer, setIsVerifiedBuyer] = useState(false);

  // Promotions State
  const [activePromos, setActivePromos] = useState([]);
  const [selectedAddons, setSelectedAddons] = useState([]);

  const colors = [
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Rose', value: '#fb7185' },
    { name: 'Emerald', value: '#10b981' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Sky', value: '#38bdf8' },
    { name: 'Slate', value: '#475569' }
  ];

  useEffect(() => {
    window.scrollTo(0, 0);
    setLoading(true);
    setSelectedImage(0);
    setSelectedVariant(null);
    setIsVerifiedBuyer(false);
    
    // Fetch product details
    fetch(`${API_BASE}/api/products/${id}`)
      .then(res => res.json())
      .then(async (data) => {
        if (!data.error) {
          setProduct(data);
          
          if (data.shop) {
            const shopId = data.shop._id || data.shop.id;
            localStorage.setItem('currentViewShop', JSON.stringify({
              _id: shopId,
              name: data.shop.name,
              logo: data.shop.logo,
              description: data.shop.description,
              owner: data.shop.owner
            }));

            localStorage.setItem('currentViewProduct', JSON.stringify({
              _id: data.id || data._id,
              name: data.name,
              price: data.price,
              image: data.image || (data.images && data.images[0]) || 'https://via.placeholder.com/150',
              category: data.category
            }));

            // Fetch promotions
            fetch(`${API_BASE}/api/promotions/active/${shopId}`)
              .then(res => res.json())
              .then(promoData => {
                if (Array.isArray(promoData)) setActivePromos(promoData);
              })
              .catch(err => console.error("Error fetching shop promotions:", err));
          } else {
            localStorage.removeItem('currentViewShop');
          }
          
          // 1. Fetch similar products by Category (Static logic)
          fetch(`${API_BASE}/api/products?category=${data.category}&pageNumber=1`)
            .then(res => res.json())
            .then(simData => {
              if (simData.products) {
                setSimilarProducts(simData.products.filter(p => p.id !== data.id).slice(0, 4));
              }
            });

          // Check if user is verified buyer
          const userInfoString = localStorage.getItem('userInfo');
          if (userInfoString) {
            const { token } = JSON.parse(userInfoString);
            try {
              const orderRes = await fetch(`${API_BASE}/api/orders/myorders`, {
                headers: {
                  "Authorization": `Bearer ${token}`
                }
              });
              const orders = await orderRes.json();
              if (Array.isArray(orders)) {
                const verified = orders.some(order => 
                  order.status === 'Delivered' && 
                  order.orderItems.some(item => item.product === id)
                );
                setIsVerifiedBuyer(verified);
              }
            } catch (err) {
              console.error("Failed to check orders verification:", err);
            }
          }

          // 2. 🚀 Fetch RECOMMENDATIONS from REAL-TIME Microservice (Collaborative Filtering)
          try {
             const isProduction = window.location.hostname.includes('onrender.com');
             const recomBaseUrl = isProduction ? 'https://stuffy-recom.onrender.com' : 'http://localhost:3010';
             const recomRes = await fetch(`${recomBaseUrl}/api/recommendations/${id}`);
             const recomData = await recomRes.json();
             if (recomData.suggested && recomData.suggested.length > 0) {
                const detailPromises = recomData.suggested.slice(0, 4).map(s => 
                   fetch(`${API_BASE}/api/products/${s.id}`).then(r => r.json())
                );
                const results = await Promise.all(detailPromises);
                setRecommendedProducts(results.filter(r => !r.error));
             }
          } catch (err) { console.warn("Recommendation service offline."); }
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });

      return () => {
        localStorage.removeItem('currentViewShop');
        localStorage.removeItem('currentViewProduct');
      };
  }, [id]);

  const submitReview = async (e) => {
    e.preventDefault();
    setSubmitError("");
    const userInfoString = localStorage.getItem('userInfo');
    if (!userInfoString) {
      setSubmitError(t('login_to_review'));
      return;
    }
    const { token } = JSON.parse(userInfoString);

    try {
      const res = await fetch(`${API_BASE}/api/products/${id}/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ rating, comment })
      });
      const data = await res.json();
      
      if (res.ok) {
        setComment("");
        alert(t('review_submitted_success'));
        // Optimistically append review locally
        setProduct((prev) => ({
          ...prev,
          reviews: [
            { _id: Date.now(), name: JSON.parse(userInfoString).name, rating, comment, createdAt: new Date().toISOString() },
            ...prev.reviews
          ],
          numReviews: prev.numReviews + 1
        }));
      } else {
        setSubmitError(data.error || t('failed_submit_review'));
      }
    } catch (err) {
      setSubmitError("Network error: " + err.message);
    }
  };

  const renderStars = (ratingVal) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
        stars.push(<span key={i} style={{ color: i <= Math.round(ratingVal) ? '#f59e0b' : '#e2e8f0', fontSize: '1.2rem' }}>★</span>);
    }
    return <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>{stars}</div>;
  };

  if (loading) return <div style={{ padding: '80px', textAlign: 'center', fontSize: '1.2rem', color: 'var(--text-muted)' }}>{t('loading_product_data')}</div>;
  if (!product) return <div style={{ padding: '80px', textAlign: 'center', fontSize: '1.2rem', color: '#ef4444' }}>{t('product_not_found')}</div>;

  return (
    <div style={{ padding: '20px 0' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 'bold', marginBottom: '20px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
        ← {t('back_to_shop')}
      </button>

      {/* Product Details & Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', marginBottom: '60px', background: 'white', padding: '40px', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.03)' }}>
        
        {/* Image Gallery */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ background: '#f8fafc', borderRadius: '20px', padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid var(--border-light)' }}>
            <img src={(product.images && product.images.length > 0 ? product.images[selectedImage] : product.image)} alt={product.name} decoding="async" style={{ width: '100%', maxWidth: '400px', objectFit: 'contain', mixBlendMode: 'multiply' }} />
          </div>
          {product.images && product.images.length > 1 && (
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '5px 0' }}>
              {product.images.map((img, idx) => (
                <button key={idx} onClick={() => setSelectedImage(idx)} style={{ flex: '0 0 70px', width: '70px', height: '70px', borderRadius: '12px', border: selectedImage === idx ? '2px solid var(--primary-color)' : '1px solid var(--border-light)', background: '#f8fafc', cursor: 'pointer', padding: '5px', overflow: 'hidden' }}>
                  <img src={img} alt={`${product.name} ${idx + 1}`} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info Column */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#6366f1', textTransform: 'uppercase', fontWeight: '800', fontSize: '0.8rem', letterSpacing: '1px', marginBottom: '10px' }}>{product.category}</span>
          <h1 style={{ margin: '0 0 15px 0', fontSize: '2.4rem', fontWeight: '900', color: 'var(--text-main)', lineHeight: 1.2 }}>{product.name}</h1>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px' }}>
            {renderStars(product.rating || 0)}
            <span style={{ color: '#64748b', fontWeight: '600', fontSize: '0.9rem' }}>{product.numReviews} {t('customer_reviews').toLowerCase()}</span>
          </div>

          <div style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--primary-color)', marginBottom: '30px' }}>
            ${product.price}
          </div>

          <p style={{ color: 'var(--text-muted)', lineHeight: '1.8', fontSize: '1.05rem', marginBottom: '30px' }}>
            {product.description}
          </p>

          {/* Active Promotion Banners & Addon Selection */}
          {activePromos.length > 0 && (
            <div style={{ marginBottom: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {/* Bundle Deal Banner */}
              {activePromos.filter(p => p.type === 'bundle_deal').map(promo => (
                <div key={promo._id} style={{
                  padding: '12px 18px',
                  background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                  border: '1px solid #fde68a',
                  borderRadius: '12px',
                  color: '#92400e',
                  fontSize: '0.9rem',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>🔥</span>
                  <span>
                    {t('bundle_deal_desc', { minQty: promo.minQuantity, value: promo.discountValue, type: promo.discountType === 'percentage' ? '%' : '$' })}
                  </span>
                </div>
              ))}

              {/* Add-on Deal Widget */}
              {activePromos.filter(p => p.type === 'addon_deal' && p.primaryProductId?._id === id).map(promo => (
                <div key={promo._id} style={{
                  padding: '20px',
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '16px',
                  color: '#0369a1'
                }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    🎁 {t('addon_deal')}
                  </h4>
                  <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#0284c7' }}>
                    {t('addon_deal_desc')}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {promo.addonProducts?.map(ap => {
                      if (!ap.product) return null;
                      const isChecked = selectedAddons.some(a => a.id === ap.product._id);
                      return (
                        <label key={ap.product._id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'white',
                          padding: '10px 15px',
                          borderRadius: '10px',
                          border: '1px solid #e0f2fe',
                          cursor: 'pointer',
                          fontSize: '0.88rem',
                          fontWeight: '700',
                          color: 'var(--text-main)'
                        }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedAddons(selectedAddons.filter(a => a.id !== ap.product._id));
                              } else {
                                setSelectedAddons([...selectedAddons, {
                                  id: ap.product._id,
                                  name: ap.product.name,
                                  price: ap.addonPrice, // special addon price
                                  image: ap.product.image
                                }]);
                              }
                            }}
                          />
                          <img src={ap.product.image} alt={ap.product.name} loading="lazy" decoding="async" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                          <span style={{ flex: 1 }}>{ap.product.name}</span>
                          <span style={{ color: 'var(--primary-color)' }}>+${ap.addonPrice}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Premium Seller Info Section */}
          {product.shop && (
            <div style={{ 
              marginBottom: '30px', 
              padding: '20px', 
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', 
              borderRadius: '16px', 
              border: '1px solid var(--border-light)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('seller_info')}</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                {product.shop.logo ? (
                  <img src={product.shop.logo} alt={product.shop.name} loading="lazy" decoding="async" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-color), #8b5cf6)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
                    {(product.shop.name || 'S').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h5 style={{ margin: '0 0 2px 0', fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{product.shop.name}</h5>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {renderStars(product.shop.rating || 5)}
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>({(product.shop.rating || 5.0).toFixed(1)} {t('rating')})</span>
                  </div>
                </div>
              </div>
              {product.shop.description && (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: '1.5' }}>
                  {product.shop.description}
                </p>
              )}
              
              {/* Shop Location & Google Maps */}
              <div style={{ marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📍</span>
                  <span><strong>Địa chỉ shop:</strong> {product.shop.district || 'Quận Thủ Đức'}, {product.shop.province || 'Hồ Chí Minh'}</span>
                </div>
                
                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-light)', height: '160px', width: '100%' }}>
                  <iframe
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    style={{ border: 0, display: 'block' }}
                    src={`https://maps.google.com/maps?q=${encodeURIComponent((product.shop.district || 'Quận Thủ Đức') + ', ' + (product.shop.province || 'Hồ Chí Minh'))}&t=&z=14&ie=UTF8&iwloc=&output=embed`}
                    allowFullScreen
                    title="Google Maps"
                  ></iframe>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => navigate(`/store?shop=${product.shop._id || product.shop.id}`)}
                  style={{ 
                    background: 'white', 
                    border: '1px solid var(--border-light)', 
                    padding: '8px 16px', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    fontWeight: '700', 
                    fontSize: '0.8rem',
                    color: 'var(--text-main)',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}
                  onMouseOver={e => e.target.style.background = '#f1f5f9'}
                  onMouseOut={e => e.target.style.background = 'white'}
                >
                  {t('view_shop')}
                </button>
                <button 
                  onClick={() => {
                    const userInfoString = localStorage.getItem('userInfo');
                    if (!userInfoString) {
                      alert(t('login_to_chat') || 'Vui lòng đăng nhập để trò chuyện với người bán.');
                      return;
                    }
                    window.dispatchEvent(new CustomEvent("OPEN_SELLER_CHAT", { detail: { shop: product.shop } }));
                  }}
                  style={{ 
                    background: 'var(--primary-color)', 
                    border: 'none', 
                    padding: '8px 16px', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    fontWeight: '700', 
                    fontSize: '0.8rem',
                    color: 'white',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 10px rgba(99,102,241,0.2)'
                  }}
                  onMouseOver={e => e.target.style.transform = 'scale(1.03)'}
                  onMouseOut={e => e.target.style.transform = 'scale(1)'}
                >
                  💬 {t('chat_now') || 'Chat ngay'}
                </button>
              </div>
            </div>
          )}

          <div style={{ marginBottom: '40px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('custom_accent_color')}</h4>
            <div style={{ display: 'flex', gap: '12px' }}>
              {colors.map(color => (
                <button
                  key={color.value}
                  onClick={() => setSelectedColor(color.value)}
                  title={color.name}
                  style={{
                    width: '38px', height: '38px', borderRadius: '50%',
                    background: color.value, cursor: 'pointer',
                    border: selectedColor === color.value ? '3px solid white' : 'none',
                    boxShadow: selectedColor === color.value ? `0 0 0 2px ${color.value}` : '0 4px 6px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s transform',
                    transform: selectedColor === color.value ? 'scale(1.1)' : 'scale(1)'
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '30px' }}>
            <button 
              onClick={() => setShow3DViewer(true)} 
              style={{ padding: '12px 24px', borderRadius: '12px', background: '#f8fafc', border: '1.5px solid var(--border-light)', cursor: 'pointer', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1rem', color: 'var(--text-main)', transition: 'all 0.2s' }}
              onMouseOver={e=>e.currentTarget.style.background='#f1f5f9'} onMouseOut={e=>e.currentTarget.style.background='#f8fafc'}
            >
              <span style={{ fontSize: '1.3rem' }}>🧊</span> {t('view_3d')} Mode
            </button>
          </div>

          {product.variants && product.variants.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('select_variant')}</h4>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {product.variants.map((v, idx) => (
                  <button key={v.sku || idx} onClick={() => setSelectedVariant(v)}
                    style={{ padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '0.88rem',
                      border: selectedVariant?.sku === v.sku ? '2px solid var(--primary-color)' : '1.5px solid var(--border-light)',
                      background: selectedVariant?.sku === v.sku ? 'rgba(99,102,241,0.08)' : 'white',
                      color: selectedVariant?.sku === v.sku ? 'var(--primary-color)' : 'var(--text-main)',
                    }}>
                    {[v.attributes?.color, v.attributes?.size, v.attributes?.storage].filter(Boolean).join(' / ') || v.sku}
                    {v.countInStock === 0 && ` (${t('out_of_stock')})`}
                  </button>
                ))}
              </div>
              {selectedVariant && (
                <p style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  {t('price')}: <strong style={{ color: 'var(--primary-color)' }}>${selectedVariant.price}</strong> — {t('stock')}: {selectedVariant.countInStock}
                </p>
              )}
            </div>
          )}

          {product.countInStock === 0 && (
            <div style={{ padding: '12px 20px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', color: '#991b1b', fontWeight: '700', marginBottom: '15px' }}>
              {t('out_of_stock')}
            </div>
          )}

          <div style={{ marginTop: 'auto', display: 'flex', gap: '15px' }}>
            <Button disabled={product.countInStock === 0} onClick={() => {
              if (product.variants && product.variants.length > 0 && !selectedVariant) {
                alert(t('select_variant_alert'));
                return;
              }
              addToCart(product, selectedVariant);
              selectedAddons.forEach(addon => {
                addToCart(addon);
              });
              setSelectedAddons([]);
              window.dispatchEvent(new CustomEvent('STUFFY_TOAST', { detail: { message: t('added_items_to_cart') } }));
            }} style={{ flex: 1, padding: '18px', fontSize: '1.1rem', borderRadius: '12px' }}>
              {t('add_to_cart')}
            </Button>
            <button 
              onClick={() => toggleWishlist(product)}
              style={{ padding: '0 20px', border: '2px solid var(--border-light)', background: 'white', borderRadius: '12px', cursor: 'pointer', fontSize: '1.5rem', transition: 'all 0.2s' }} 
              onMouseOver={e=>e.target.style.borderColor='var(--primary-color)'} onMouseOut={e=>e.target.style.borderColor='var(--border-light)'}
            >
              {wishlist.some(w => w.id === product.id) ? '❤️' : '🤍'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '20px', marginTop: '25px', color: '#64748b', fontSize: '0.85rem', fontWeight: '600' }}>
            <span>✓ {t('free_shipping_options')}</span>
            <span>✓ {t('return_policy')}</span>
            <span>✓ {t('genuine_warranty')}</span>
          </div>
        </div>
      </div>

      {/* Customer Reviews Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 350px) 1fr', gap: '40px', marginBottom: '60px' }}>
        {/* Write a Review Box */}
        <div style={{ background: '#f8fafc', padding: '30px', borderRadius: '20px', border: '1px solid var(--border-light)', height: 'fit-content' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1.3rem', fontWeight: '800' }}>{t('write_review')}</h3>
          {submitError && <div style={{ color: '#991b1b', marginBottom: '15px', fontSize: '0.9rem', padding: '10px', background: '#fef2f2', borderRadius: '8px' }}>{submitError}</div>}
          
          {!localStorage.getItem('userInfo') ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.5' }}>
              {t('login_to_review')}
            </p>
          ) : !isVerifiedBuyer ? (
            <p style={{ margin: 0, color: '#ef4444', fontSize: '0.95rem', fontWeight: '600', lineHeight: '1.5' }}>
              {t('verified_buyer_only')}
            </p>
          ) : (
            <form onSubmit={submitReview} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>{t('rating_label')}</label>
                <select value={rating} onChange={e => setRating(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', outline: 'none' }}>
                  <option value="5">5 - Excellent</option>
                  <option value="4">4 - Very Good</option>
                  <option value="3">3 - Average</option>
                  <option value="2">2 - Poor</option>
                  <option value="1">1 - Terrible</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>{t('experience_label')}</label>
                <textarea 
                  required 
                  placeholder={t('experience_placeholder')} 
                  value={comment} onChange={e => setComment(e.target.value)} 
                  style={{ width: '100%', padding: '12px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid var(--border-light)', outline: 'none', minHeight: '120px', resize: 'vertical' }}
                />
              </div>
              <Button type="submit">{t('submit_review')}</Button>
            </form>
          )}
        </div>

        {/* Reviews List */}
        <div>
          <h3 style={{ margin: '0 0 25px 0', fontSize: '1.6rem', fontWeight: '800' }}>{t('customer_reviews')}</h3>
          {product.reviews && product.reviews.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {product.reviews.map(review => (
                <div key={review._id} style={{ padding: '25px', background: 'white', borderRadius: '16px', boxShadow: '0 5px 15px rgba(0,0,0,0.02)', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-color), #8b5cf6)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
                        {review.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '1.05rem' }}>{review.name}</div>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontSize: '0.72rem', fontWeight: '700', background: '#dcfce7', padding: '2px 8px', borderRadius: '99px' }}>
                            [Verified] {t('verified_buyer')}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{new Date(review.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                    {renderStars(review.rating)}
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-main)', lineHeight: '1.6', fontSize: '0.95rem' }}>{review.comment}</p>
                  {review.reply && (
                    <div style={{ 
                      marginTop: '15px', 
                      padding: '15px', 
                      background: '#f8fafc', 
                      borderRadius: '12px', 
                      borderLeft: '4px solid var(--primary-color)',
                      fontSize: '0.9rem'
                    }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-main)', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>[Store]</span> {t('seller_response') || 'Seller Response'}
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: '1.5' }}>{review.reply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', background: '#f8fafc', borderRadius: '16px', border: '2px dashed var(--border-light)' }}>
              <span style={{ fontSize: '3rem', opacity: 0.2 }}>[Note]</span>
              <p style={{ margin: '10px 0 0 0', color: 'var(--text-muted)' }}>{t('no_reviews_yet')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Real-time Recommendations (AI Driven) */}
      {recommendedProducts.length > 0 && (
        <div style={{ marginBottom: '60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px' }}>
             <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '800' }}>{t('people_also_viewed')}</h3>
             <span style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontSize: '0.7rem', fontWeight: '800', padding: '4px 12px', borderRadius: '99px' }}>{t('ai_recommendation')}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "20px" }}>
            {recommendedProducts.map(p => (
              <div key={p.id} className="ds-glass-card" style={{ padding: '20px', borderRadius: '16px', position: 'relative', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid transparent' }} onClick={() => navigate(`/product/${p.id}`)} onMouseOver={e=>e.currentTarget.style.borderColor='var(--primary-color)'} onMouseOut={e=>e.currentTarget.style.borderColor='transparent'}>
                <div style={{ background: '#f1f5f9', borderRadius: '12px', padding: '15px', marginBottom: '15px', display: 'flex', justifyContent: 'center' }}>
                  <img src={p.image} alt={p.name} loading="lazy" decoding="async" style={{ width: "120px", height: "120px", objectFit: 'contain', mixBlendMode: 'multiply' }} />
                </div>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "1.05rem", fontWeight: '700', color: 'var(--text-main)', minHeight: '40px' }}>{p.name}</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: "800", color: "var(--primary-color)" }}>${p.price}</span>
                  {renderStars(p.rating || 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Similar Products */}
      {similarProducts.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 25px 0', fontSize: '1.6rem', fontWeight: '800' }}>{t('similar_products')}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "20px" }}>
            {similarProducts.map(p => (
              <div key={p.id} className="ds-glass-card" style={{ padding: '20px', borderRadius: '16px', position: 'relative', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid transparent' }} onClick={() => navigate(`/product/${p.id}`)} onMouseOver={e=>e.currentTarget.style.borderColor='var(--primary-color)'} onMouseOut={e=>e.currentTarget.style.borderColor='transparent'}>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleWishlist(p); }} 
                  style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.9)', border: '1px solid var(--border-light)', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', zIndex: 2, fontSize: '0.9rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
                >
                  {wishlist.some(w => w.id === p.id) ? '[Liked]' : '[Like]'}
                </button>

                <div style={{ background: '#f1f5f9', borderRadius: '12px', padding: '15px', marginBottom: '15px', display: 'flex', justifyContent: 'center' }}>
                  <img src={p.image} alt={p.name} loading="lazy" decoding="async" style={{ width: "120px", height: "120px", objectFit: 'contain', mixBlendMode: 'multiply' }} />
                </div>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "1.05rem", fontWeight: '700', color: 'var(--text-main)', minHeight: '40px' }}>{p.name}</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: "800", color: "var(--primary-color)" }}>${p.price}</span>
                  {renderStars(p.rating || 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {show3DViewer && (
        <React.Suspense fallback={<div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white' }}>{t('loading_3d')}</div>}>
          <Viewer3D 
            color={selectedColor} 
            image={product.image} 
            name={product.name} 
            onClose={() => setShow3DViewer(false)} 
          />
        </React.Suspense>
      )}
    </div>
  );
}
