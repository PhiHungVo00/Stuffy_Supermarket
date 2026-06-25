import React, { useState, useEffect } from "react";
import { useCartStore } from "store/store";
import { getOptimizedImage } from "./utils/image";
// @ts-ignore
import { useI18nStore } from "store/i18n";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api-xmln.onrender.com' : 'http://localhost:5000';

export default function Storefront() {
  const { t } = useI18nStore();
  const [shopId, setShopId] = useState("");
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSlide, setActiveSlide] = useState({}); // { [widgetId]: idx }

  const addToCart = useCartStore((state) => state.addToCart);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("shop");
    if (id) {
      setShopId(id);
    }
  }, []);

  useEffect(() => {
    if (!shopId) return;

    const fetchShopData = async () => {
      setLoading(true);
      try {
        // 1. Fetch shop info
        const shopRes = await fetch(`${API_BASE}/api/shops/${shopId}`);
        const shopData = await shopRes.json();
        if (shopData && !shopData.error) {
          setShop(shopData);
          
          // Save to localStorage for floating chat integration
          localStorage.setItem('currentViewShop', JSON.stringify({
            _id: shopData._id,
            name: shopData.name,
            logo: shopData.logo,
            owner: shopData.owner
          }));
        }

        // 2. Fetch products of this shop
        const prodRes = await fetch(`${API_BASE}/api/products?pageNumber=1&pageSize=999&shop=${shopId}`);
        const prodData = await prodRes.json();
        setProducts(prodData.products || []);
      } catch (err) {
        console.error("Error loading storefront:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchShopData();
  }, [shopId]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>{t('storefront_loading')}</div>;
  }

  if (!shop) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px", border: "2px dashed var(--border-light)", borderRadius: "16px", background: "#f8fafc" }}>
        <h3>{t('shop_not_found')}</h3>
        <p style={{ color: "var(--text-muted)" }}>{t('shop_deactivated')}</p>
      </div>
    );
  }

  const widgets = shop.decorationConfig?.widgets || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
      
      {/* Premium Shop Header Banner */}
      <div className="ds-glass-card" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "white", padding: "30px", borderRadius: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "20px", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          {shop.logo ? (
            <img src={shop.logo} style={{ width: "80px", height: "80px", borderRadius: "50%", border: "3px solid rgba(255,255,255,0.2)", objectFit: "cover" }} alt={shop.name} decoding="async" />
          ) : (
            <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white", display: "flex", justifyContent: "center", alignItems: "center", fontWeight: "bold", fontSize: "2rem", border: "3px solid rgba(255,255,255,0.2)" }}>
              {shop.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "1.8rem", fontWeight: "900" }}>{shop.name}</h2>
              <span style={{ fontSize: "0.75rem", background: "#3b82f6", color: "white", padding: "2px 8px", borderRadius: "99px", fontWeight: "700" }}>{t('shopee_mall')}</span>
            </div>
            <p style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: "0.95rem" }}>{shop.description || t('no_shop_desc')}</p>
            <div style={{ display: "flex", alignItems: "center", gap: "15px", marginTop: "12px", fontSize: "0.85rem", color: "#cbd5e1" }}>
              <span>★ {shop.rating || "5.0"} {t('rating')}</span>
              <span>•</span>
              <span>{products.length} {t('products')}</span>
              <span>•</span>
              <span>{t('origin') || 'Origin'}: {shop.province || "HCMC"}</span>
            </div>
          </div>
        </div>

        {/* Action button */}
        <button 
          onClick={() => {
            // Open Floating Chat Support Box tab 2 "Seller Chat"
            window.dispatchEvent(new CustomEvent("OPEN_SELLER_CHAT", { detail: { shop } }));
          }}
          style={{ padding: "12px 24px", borderRadius: "10px", background: "white", color: "#0f172a", border: "none", fontWeight: "800", cursor: "pointer", fontSize: "0.92rem", transition: "all 0.2s", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}
          onMouseOver={e => e.target.style.transform = 'scale(1.03)'}
          onMouseOut={e => e.target.style.transform = 'scale(1)'}
        >
          [Chat] {t('chat_with_seller')}
        </button>
      </div>

      {/* Main Decorated Storefront */}
      {widgets.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
          {widgets.map((widget) => (
            <div key={widget.id} className="ds-glass-card" style={{ background: "white", padding: "25px", borderRadius: "20px", border: "1px solid var(--border-light)" }}>
              {widget.title && (
                <h3 style={{ margin: "0 0 20px 0", fontSize: "1.3rem", fontWeight: "800", color: "var(--text-main)", borderLeft: "4px solid var(--primary-color)", paddingLeft: "10px" }}>
                  {widget.title}
                </h3>
              )}

              {/* Widget: Carousel */}
              {widget.type === "carousel" && widget.images && widget.images.length > 0 && (
                <div style={{ width: "100%", height: "350px", borderRadius: "14px", overflow: "hidden", position: "relative" }}>
                  <img 
                    src={widget.images[activeSlide[widget.id] || 0]} 
                    style={{ width: "100%", height: "100%", objectFit: "cover", transition: "all 0.5s ease-in-out" }} 
                    alt={widget.title || "Storefront Banner"} 
                    decoding="async"
                  />
                  {widget.images.length > 1 && (
                    <>
                      <button 
                        onClick={() => {
                          const currentIdx = activeSlide[widget.id] || 0;
                          const nextIdx = currentIdx === 0 ? widget.images.length - 1 : currentIdx - 1;
                          setActiveSlide(prev => ({ ...prev, [widget.id]: nextIdx }));
                        }}
                        aria-label="Previous slide"
                        style={{ position: "absolute", left: "15px", top: "50%", transform: "translateY(-50%)", width: "40px", height: "40px", borderRadius: "50%", background: "rgba(0,0,0,0.4)", border: "none", color: "white", cursor: "pointer", fontWeight: "bold" }}
                      >
                        ‹
                      </button>
                      <button 
                        onClick={() => {
                          const currentIdx = activeSlide[widget.id] || 0;
                          const nextIdx = (currentIdx + 1) % widget.images.length;
                          setActiveSlide(prev => ({ ...prev, [widget.id]: nextIdx }));
                        }}
                        aria-label="Next slide"
                        style={{ position: "absolute", right: "15px", top: "50%", transform: "translateY(-50%)", width: "40px", height: "40px", borderRadius: "50%", background: "rgba(0,0,0,0.4)", border: "none", color: "white", cursor: "pointer", fontWeight: "bold" }}
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Widget: Featured Row */}
              {widget.type === "featured" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "25px" }}>
                  {(!widget.productIds || widget.productIds.length === 0) ? (
                    <div style={{ color: "var(--text-muted)", gridColumn: "1/-1" }}>{t('no_featured_products')}</div>
                  ) : (
                    widget.productIds.map(pid => {
                      const prod = products.find(p => p._id === pid || p.id === pid);
                      if (!prod) return null;
                      return (
                        <div key={pid} className="ds-glass-card" style={{ display: "flex", flexDirection: "column", padding: "15px", border: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: "16px", boxShadow: "none" }}>
                          <div style={{ background: "white", borderRadius: "10px", padding: "10px", display: "flex", justifyContent: "center", marginBottom: "12px", cursor: "pointer" }} onClick={() => window.location.href = `/product/${prod._id || prod.id}`}>
                            <img src={getOptimizedImage(prod.image, 200, 80)} style={{ width: "120px", height: "120px", objectFit: "contain" }} alt={prod.name} loading="lazy" decoding="async" />
                          </div>
                          <h4 style={{ margin: "0 0 6px 0", fontSize: "0.95rem", fontWeight: "700", color: "var(--text-main)", minHeight: "40px", cursor: "pointer" }} onClick={() => window.location.href = `/product/${prod._id || prod.id}`}>{prod.name}</h4>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                            <span style={{ fontWeight: "800", color: "var(--primary-color)", fontSize: "1.1rem" }}>${prod.price}</span>
                            <button 
                              onClick={() => {
                                addToCart(prod);
                                window.dispatchEvent(new CustomEvent('STUFFY_TOAST', { 
                                  detail: { message: t('added_to_cart_toast', { name: prod.name }), type: 'success' } 
                                }));
                              }} 
                              aria-label="Add to cart"
                              style={{ border: "none", background: "var(--primary-color)", color: "white", width: "30px", height: "30px", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", cursor: "pointer", fontWeight: "bold" }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Widget: Custom HTML/Text */}
              {widget.type === "text" && (
                <div style={{ color: "var(--text-muted)", fontSize: "1rem", whiteSpace: "pre-line", lineHeight: 1.6 }}>
                  {widget.content}
                </div>
              )}

            </div>
          ))}
        </div>
      ) : (
        // Fallback Storefront: Grid of all products
        <div className="ds-glass-card" style={{ background: "white", padding: "30px", borderRadius: "20px", border: "1px solid var(--border-light)" }}>
          <h3 style={{ margin: "0 0 25px 0", fontSize: "1.4rem", fontWeight: "800", color: "var(--text-main)" }}>{t('all_store_products')}</h3>
          {products.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>{t('no_products_yet')}</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "25px" }}>
              {products.map((prod) => (
                <div key={prod._id || prod.id} className="ds-glass-card" style={{ display: "flex", flexDirection: "column", padding: "15px", border: "1px solid #f1f5f9", borderRadius: "16px", boxShadow: "none" }}>
                  <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "12px", display: "flex", justifyContent: "center", marginBottom: "15px", cursor: "pointer" }} onClick={() => window.location.href = `/product/${prod._id || prod.id}`}>
                    <img src={getOptimizedImage(prod.image, 240, 80)} style={{ width: "140px", height: "140px", objectFit: "contain", mixBlendMode: "multiply" }} alt={prod.name} loading="lazy" decoding="async" />
                  </div>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "1.05rem", fontWeight: "700", color: "var(--text-main)", minHeight: "45px", cursor: "pointer" }} onClick={() => window.location.href = `/product/${prod._id || prod.id}`}>{prod.name}</h4>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                    <span style={{ fontWeight: "850", color: "var(--primary-color)", fontSize: "1.2rem" }}>${prod.price}</span>
                    <button 
                      onClick={() => {
                        addToCart(prod);
                        window.dispatchEvent(new CustomEvent('STUFFY_TOAST', { 
                          detail: { message: t('added_to_cart_toast', { name: prod.name }), type: 'success' } 
                        }));
                      }}
                      style={{ padding: "8px 16px", background: "var(--primary-color)", color: "white", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer", fontSize: "0.85rem" }}
                    >
                      {t('add_to_cart')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
