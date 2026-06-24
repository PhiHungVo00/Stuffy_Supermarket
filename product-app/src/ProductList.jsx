import React, { useState, useEffect, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useCartStore, useWishlistStore } from "store/store";
import { productApi } from "store/api";
import Button from "design_system/Button";
import ProductSkeleton from "design_system/ProductSkeleton";
import { io } from "socket.io-client";
// @ts-ignore
import { useI18nStore } from "store/i18n";
import { getOptimizedImage } from "./utils/image";
// @ts-ignore
import { incrementCart } from "store/signals";

// Lazy-load the 3D viewer (2MB+) — only fetched when user clicks "View in 3D"
const Viewer3D = React.lazy(() => import("viewer/Viewer"));

export default function ProductList() {
  const { t } = useI18nStore();
  const navigate = useNavigate();
  const addToCart = useCartStore((state) => state.addToCart);
  const { wishlist, toggleWishlist } = useWishlistStore();
  
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flashingId, setFlashingId] = useState(null);
  const [active3DProduct, setActive3DProduct] = useState(null);
  const [aiMatches, setAiMatches] = useState(null);
  
  // Pagination & Filtering state
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [category, setCategory] = useState("All");
  const [keyword, setKeyword] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [serverCategories, setServerCategories] = useState([]);

  const defaultCategories = ["All", "Laptops", "Phones", "Audio", "Gaming", "Video", "Accessories"];
  const categories = serverCategories.length > 0 ? ["All", ...serverCategories] : defaultCategories;

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const hasFilters = sortBy !== 'newest' || minPrice || maxPrice;
      let data;
      if (hasFilters) {
        data = await productApi.getAllFiltered(keyword, page, category, sortBy, minPrice, maxPrice);
      } else {
        data = await productApi.getAllGraphQL(keyword, page, category);
      }
      if (data && data.products) {
        setProducts(data.products);
        setPages(data.pages);
        if (data.categories) setServerCategories(data.categories);
      } else {
        setProducts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('[ProductList] Failed to fetch products:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [page, category, keyword, sortBy, minPrice, maxPrice]);

  useEffect(() => {
    const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
    const socketUrl = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';
    const socket = io(socketUrl);

    socket.on("PRICE_UPDATED", (updatedProduct) => {
      setProducts((current) => current.map((p) => (p.id === updatedProduct.id ? updatedProduct : p)));
      setFlashingId(updatedProduct.id);
      setTimeout(() => setFlashingId(null), 1500);
    });

    socket.on("DYNAMIC_PRICE_UPDATE", ({ productId, newPrice, originalPrice, message }) => {
      setProducts((current) => current.map((p) => (p.id === productId || p._id === productId ? { ...p, price: newPrice, originalPrice } : p)));
      setFlashingId(productId);
      
      // Dispatch a toast event for the flash sale
      window.dispatchEvent(new CustomEvent('STUFFY_TOAST', { 
        detail: { message: message, type: 'warning' } 
      }));

      setTimeout(() => setFlashingId(null), 3000);
    });

    socket.on("NEW_PRODUCT", (newProduct) => {
      if (category === "All" || newProduct.category === category) {
        setProducts((current) => [...current, newProduct]);
      }
    });
    
    socket.on("PRODUCT_DELETED", (id) => setProducts((current) => current.filter(p => p.id !== id)));

    const handleAIResult = (e) => setAiMatches(e.detail.matches);
    const handleProductSearch = (e) => {
      setKeyword(e.detail.keyword);
      setPage(1);
    };

    window.addEventListener('AI_SEARCH_RESULT', handleAIResult);
    window.addEventListener('PRODUCT_SEARCH', handleProductSearch);
    
    return () => {
      socket.off("PRICE_UPDATED");
      socket.off("DYNAMIC_PRICE_UPDATE");
      socket.off("NEW_PRODUCT");
      socket.off("PRODUCT_DELETED");
      socket.disconnect();
      window.removeEventListener('AI_SEARCH_RESULT', handleAIResult);
      window.removeEventListener('PRODUCT_SEARCH', handleProductSearch);
    };
  }, [category]);

  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
        stars.push(
            <span key={i} style={{ color: i <= Math.round(rating) ? '#f59e0b' : '#e2e8f0', fontSize: '1.1rem' }}>
                ★
            </span>
        );
    }
    return <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>{stars}</div>;
  };

  return (
    <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start' }}>
      
      {/* CỘT TRÁI: DANH MỤC LỘNG LẪY */}
      <aside style={{ width: '250px', flexShrink: 0, position: 'sticky', top: '40px' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: '0 0 20px 0', color: 'var(--text-main)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{t('category')}</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {categories.map((cat) => (
            <li key={cat}>
              <button 
                onClick={() => { setCategory(cat); setPage(1); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '12px 16px', borderRadius: '10px',
                  background: category === cat ? 'linear-gradient(135deg, var(--primary-color), #8b5cf6)' : 'white',
                  color: category === cat ? 'white' : 'var(--text-muted)',
                  border: category === cat ? 'none' : '1px solid var(--border-light)',
                  fontWeight: category === cat ? '700' : '500',
                  cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: category === cat ? '0 10px 20px rgba(99,102,241,0.25)' : 'none'
                }}
              >
                {cat}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* CỘT PHẢI: LƯỚI SẢN PHẨM & PHÂN TRANG */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
           <h3 style={{ fontSize: '1.8rem', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>
             {category === 'All' ? t('all_products') : category}
           </h3>
           <span className="ds-badge" style={{ background: '#dcfce7', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}>
              <span style={{ width: '8px', height: '8px', background: '#16a34a', borderRadius: '50%', animation: 'blink 1s infinite alternate' }}></span>
              {t('live_sync')}
           </span>
        </div>

        {/* Sort & Price Filter Bar */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap' }}>
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); setPage(1); }}
            aria-label="Sắp xếp sản phẩm"
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer', background: 'white' }}
          >
            <option value="newest">{t('sort_newest')}</option>
            <option value="price_asc">{t('sort_price_asc')}</option>
            <option value="price_desc">{t('sort_price_desc')}</option>
            <option value="rating">{t('sort_rating')}</option>
            <option value="popular">{t('sort_popular')}</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input type="number" placeholder={t('min_price')} value={minPrice} onChange={e => setMinPrice(e.target.value)} onBlur={() => { setPage(1); fetchProducts(); }} style={{ width: '80px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }} />
            <span style={{ color: 'var(--text-muted)' }}>-</span>
            <input type="number" placeholder={t('max_price')} value={maxPrice} onChange={e => setMaxPrice(e.target.value)} onBlur={() => { setPage(1); fetchProducts(); }} style={{ width: '80px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }} />
          </div>
          {(minPrice || maxPrice) && (
            <button onClick={() => { setMinPrice(''); setMaxPrice(''); setPage(1); }} style={{ padding: '6px 14px', borderRadius: '8px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer' }}>
              {t('clear_price')}
            </button>
          )}
        </div>

        {/* Banner kết quả AI */}
        {aiMatches !== null && (
          <div style={{ marginBottom: '24px', padding: '14px 20px', background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)', borderRadius: '14px', border: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.3rem' }}>*</span>
              <div>
                <p style={{ margin: 0, fontWeight: '800', color: '#4338ca', fontSize: '0.95rem' }}>{t(aiMatches.length === 1 ? 'ai_found_product' : 'ai_found_products', { count: aiMatches.length })}</p>
                <p style={{ margin: 0, color: '#6366f1', fontSize: '0.82rem' }}>{t('other_products_dimmed')}</p>
              </div>
            </div>
            <button onClick={() => { setAiMatches(null); window.dispatchEvent(new CustomEvent('AI_SEARCH_RESET')); }} style={{ padding: '6px 16px', fontSize: '0.85rem', fontWeight: '700', color: '#6366f1', background: 'white', border: '1px solid #c7d2fe', borderRadius: '99px', cursor: 'pointer' }}>
              × {t('clear_filter')}
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "30px" }}>
            {[...Array(8)].map((_, i) => <ProductSkeleton key={i} />)}
          </div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', border: '2px dashed var(--border-light)', borderRadius: '16px', background: '#f8fafc' }}>
            <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.4rem' }}>{t('no_products_found')}</h3>
            <p style={{ color: 'var(--text-muted)' }}>{t('try_different_category')}</p>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "30px" }}>
              {products.map((p) => {
                const isFlashing = flashingId === p.id;
                const isAiMatch = aiMatches !== null && aiMatches.some(name => p.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.name.toLowerCase()));
                const isDimmed = aiMatches !== null && !isAiMatch;
                return (
                  <div key={p.id} className="ds-glass-card" style={{ 
                    display: "flex", flexDirection: "column",
                    transform: isFlashing ? "scale(1.05)" : isAiMatch ? "scale(1.03)" : "scale(1)",
                    border: isFlashing ? "2px solid #ef4444" : isAiMatch ? "2px solid #6366f1" : "",
                    boxShadow: isFlashing ? "0 20px 25px -5px rgba(239, 68, 68, 0.2)" : isAiMatch ? "0 20px 40px rgba(99,102,241,0.2)" : "",
                    opacity: isDimmed ? 0.35 : 1, transition: 'all 0.4s', position: 'relative',
                  }}>
                    {isAiMatch && ( <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', fontSize: '0.7rem', fontWeight: '800', padding: '4px 10px', borderRadius: '99px', zIndex: 1 }}>{t('ai_pick')}</div> )}
                    {p.countInStock !== undefined && p.countInStock <= 0 && (
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '8px 20px', borderRadius: '8px', fontWeight: '800', fontSize: '0.9rem', zIndex: 3 }}>{t('out_of_stock')}</div>
                    )}
                    {p.countInStock > 0 && p.countInStock <= 5 && (
                      <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: '#fef2f2', color: '#991b1b', fontSize: '0.7rem', fontWeight: '800', padding: '4px 10px', borderRadius: '99px', zIndex: 1, border: '1px solid #fca5a5' }}>{t('only_left', { count: p.countInStock })}</div>
                    )}
                    
                    <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', color: 'var(--text-main)', fontSize: '0.7rem', fontWeight: '800', padding: '4px 10px', borderRadius: '99px', border: '1px solid var(--border-light)', zIndex: 1, textTransform: 'uppercase' }}>
                      {p.category}
                    </div>

                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleWishlist(p); }} 
                      aria-label={wishlist.some(w => w.id === p.id) ? "Xóa khỏi danh sách yêu thích" : "Thêm vào danh sách yêu thích"}
                      style={{ position: 'absolute', top: '12px', right: '100px', background: 'rgba(255,255,255,0.9)', border: '1px solid var(--border-light)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', zIndex: 2, fontSize: '1rem', transition: 'all 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
                    >
                      {wishlist.some(w => w.id === p.id) ? '[Liked]' : '[Like]'}
                    </button>

                    <div style={{ background: '#f1f5f9', borderRadius: '12px', padding: '20px', marginBottom: '15px', display: 'flex', justifyContent: 'center', transition: 'all 0.3s', cursor: 'pointer' }} onClick={() => navigate(`/product/${p.id}`)}>
                      <img src={getOptimizedImage(p.image, 320, 80)} alt={p.name} loading="lazy" decoding="async" style={{ width: "160px", height: "160px", objectFit: 'contain', mixBlendMode: 'multiply' }} />
                    </div>
                    
                    <h4 style={{ margin: "0 0 4px 0", fontSize: "1.2rem", fontWeight: '700', color: 'var(--text-main)', minHeight: '50px', cursor: 'pointer' }} onClick={() => navigate(`/product/${p.id}`)}>{p.name}</h4>
                    
                    {/* Reviews System */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      {renderStars(p.rating || 0)}
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>({p.numReviews || 0})</span>
                    </div>

                    <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: "0.95rem", lineHeight: "1.5", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "42px" }}>{p.description || t('no_description')}</p>
                    
                    <button 
                      onClick={() => setActive3DProduct({ color: '#6366f1', image: p.image, name: p.name })} 
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', background: '#f8fafc', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', color: 'var(--text-main)' }}
                    >
                      {t('view_3d')}
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'min(15px, auto)', paddingTop: '15px' }}>
                      <span style={{ margin: 0, fontWeight: "800", fontSize: isFlashing ? "1.8rem" : "1.5rem", color: isFlashing ? "#ef4444" : "var(--primary-color)", transition: "all 0.3s" }}>
                        ${p.price}
                      </span>
                      <Button onClick={() => {
                        addToCart(p);
                        incrementCart();
                        window.dispatchEvent(new CustomEvent('STUFFY_TOAST', { 
                          detail: { message: t('added_to_cart_toast', { name: p.name }), type: 'success' } 
                        }));
                      }} style={isFlashing ? { background: "#ef4444" } : undefined}>
                        {isFlashing ? t('add_now') : t('add_to_cart')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {pages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '40px', paddingTop: '20px', borderTop: '1px solid var(--border-light)' }}>
                <button 
                  onClick={() => setPage(page - 1)} disabled={page === 1}
                  style={{ padding: '10px 16px', borderRadius: '8px', background: page === 1 ? '#f1f5f9' : 'white', border: '1px solid var(--border-light)', color: page === 1 ? '#94a3b8' : 'var(--text-main)', cursor: page === 1 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                >
                  {t('previous')}
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[...Array(pages).keys()].map(x => (
                    <button 
                      key={x + 1} onClick={() => setPage(x + 1)}
                      style={{ width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: x + 1 === page ? 'none' : '1px solid var(--border-light)', background: x + 1 === page ? 'var(--primary-color)' : 'white', color: x + 1 === page ? 'white' : 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      {x + 1}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setPage(page + 1)} disabled={page === pages}
                  style={{ padding: '10px 16px', borderRadius: '8px', background: page === pages ? '#f1f5f9' : 'white', border: '1px solid var(--border-light)', color: page === pages ? '#94a3b8' : 'var(--text-main)', cursor: page === pages ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                >
                  {t('next')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {active3DProduct && (
        <Suspense fallback={<div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.9)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><span style={{ fontSize: '1rem', color: 'white', fontWeight: '600' }}>{t('loading_3d')}</span></div>}>
          <Viewer3D color={active3DProduct.color} image={active3DProduct.image} name={active3DProduct.name} onClose={() => setActive3DProduct(null)} />
        </Suspense>
      )}

      <style>{`@keyframes blink { 0% { opacity: 0.4; } 100% { opacity: 1; } }`}</style>
    </div>
  );
}
