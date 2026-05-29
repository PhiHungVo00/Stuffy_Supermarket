import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCartStore, useWishlistStore } from "store/store";
import { productApi } from "store/api";
import Button from "design_system/Button";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';

// Lazy-load the 3D viewer (2MB+) — only fetched when user clicks "View in 3D"
const Viewer3D = React.lazy(() => import("viewer/Viewer"));

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
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
    // Fetch product details
    fetch(`${API_BASE}/api/products/${id}`)
      .then(res => res.json())
      .then(async (data) => {
        if (!data.error) {
          setProduct(data);
          
          // 1. Fetch similar products by Category (Static logic)
          fetch(`${API_BASE}/api/products?category=${data.category}&pageNumber=1`)
            .then(res => res.json())
            .then(simData => {
              if (simData.products) {
                setSimilarProducts(simData.products.filter(p => p.id !== data.id).slice(0, 4));
              }
            });

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
  }, [id]);

  const submitReview = async (e) => {
    e.preventDefault();
    setSubmitError("");
    const userInfoString = localStorage.getItem('userInfo');
    if (!userInfoString) {
      setSubmitError("You must be logged in to review.");
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
        // Optimistic update or refetch
        setComment("");
        alert("Review submitted successfully!");
        // Small hack to append locally without refetching
        setProduct((prev) => ({
          ...prev,
          reviews: [
            { _id: Date.now(), name: JSON.parse(userInfoString).name, rating, comment, createdAt: new Date().toISOString() },
            ...prev.reviews
          ],
          numReviews: prev.numReviews + 1
        }));
      } else {
        setSubmitError(data.error || "Failed to submit review");
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

  if (loading) return <div style={{ padding: '80px', textAlign: 'center', fontSize: '1.2rem', color: 'var(--text-muted)' }}>Loading Product Data...</div>;
  if (!product) return <div style={{ padding: '80px', textAlign: 'center', fontSize: '1.2rem', color: '#ef4444' }}>Product not found.</div>;

  return (
    <div style={{ padding: '20px 0' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 'bold', marginBottom: '20px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
        ← Back to Shop
      </button>

      {/* Tầng 1: Chi tiết Sản phẩm & Hành động Mua */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', marginBottom: '60px', background: 'white', padding: '40px', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.03)' }}>
        
        {/* Image Gallery */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ background: '#f8fafc', borderRadius: '20px', padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid var(--border-light)' }}>
            <img src={(product.images && product.images.length > 0 ? product.images[selectedImage] : product.image)} alt={product.name} style={{ width: '100%', maxWidth: '400px', objectFit: 'contain', mixBlendMode: 'multiply' }} />
          </div>
          {product.images && product.images.length > 1 && (
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '5px 0' }}>
              {product.images.map((img, idx) => (
                <button key={idx} onClick={() => setSelectedImage(idx)} style={{ flex: '0 0 70px', width: '70px', height: '70px', borderRadius: '12px', border: selectedImage === idx ? '2px solid var(--primary-color)' : '1px solid var(--border-light)', background: '#f8fafc', cursor: 'pointer', padding: '5px', overflow: 'hidden' }}>
                  <img src={img} alt={`${product.name} ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Thông tin */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#6366f1', textTransform: 'uppercase', fontWeight: '800', fontSize: '0.8rem', letterSpacing: '1px', marginBottom: '10px' }}>{product.category}</span>
          <h1 style={{ margin: '0 0 15px 0', fontSize: '2.4rem', fontWeight: '900', color: 'var(--text-main)', lineHeight: 1.2 }}>{product.name}</h1>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px' }}>
            {renderStars(product.rating || 0)}
            <span style={{ color: '#64748b', fontWeight: '600', fontSize: '0.9rem' }}>{product.numReviews} Student Reviews</span>
          </div>

          <div style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--primary-color)', marginBottom: '30px' }}>
            ${product.price}
          </div>

          <p style={{ color: 'var(--text-muted)', lineHeight: '1.8', fontSize: '1.05rem', marginBottom: '30px' }}>
            {product.description}
          </p>

          <div style={{ marginBottom: '40px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Custom Accent Color</h4>
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
              <span style={{ fontSize: '1.3rem' }}>🧊</span> View in 3D AR Mode
            </button>
          </div>

          {product.variants && product.variants.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Select Variant</h4>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {product.variants.map((v, idx) => (
                  <button key={v.sku || idx} onClick={() => setSelectedVariant(v)}
                    style={{ padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '0.88rem',
                      border: selectedVariant?.sku === v.sku ? '2px solid var(--primary-color)' : '1.5px solid var(--border-light)',
                      background: selectedVariant?.sku === v.sku ? 'rgba(99,102,241,0.08)' : 'white',
                      color: selectedVariant?.sku === v.sku ? 'var(--primary-color)' : 'var(--text-main)',
                    }}>
                    {[v.attributes?.color, v.attributes?.size, v.attributes?.storage].filter(Boolean).join(' / ') || v.sku}
                    {v.countInStock === 0 && ' (Out of Stock)'}
                  </button>
                ))}
              </div>
              {selectedVariant && (
                <p style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Price: <strong style={{ color: 'var(--primary-color)' }}>${selectedVariant.price}</strong> — Stock: {selectedVariant.countInStock}
                </p>
              )}
            </div>
          )}

          {product.countInStock === 0 && (
            <div style={{ padding: '12px 20px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#dc2626', fontWeight: '700', marginBottom: '15px' }}>
              Out of Stock
            </div>
          )}

          <div style={{ marginTop: 'auto', display: 'flex', gap: '15px' }}>
            <Button disabled={product.countInStock === 0 || (selectedVariant && selectedVariant.countInStock === 0)} onClick={() => {
              const variantInfo = selectedVariant ? {
                variantId: selectedVariant._id || selectedVariant.sku,
                variantSku: selectedVariant.sku,
                variantPrice: selectedVariant.price,
                variantAttributes: selectedVariant.attributes,
              } : undefined;
              addToCart(product, variantInfo);
              const label = selectedVariant
                ? `Added ${product.name} (${selectedVariant.sku}) to cart!`
                : `Added ${product.name} to cart!`;
              window.dispatchEvent(new CustomEvent('STUFFY_TOAST', { detail: { message: label } }));
            }} style={{ flex: 1, padding: '18px', fontSize: '1.1rem', borderRadius: '12px' }}>
              Add to Cart
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
            <span>✓ Free Shipping Options</span>
            <span>✓ 30-Day Return Policy</span>
            <span>✓ Genuine Warranty</span>
          </div>
        </div>
      </div>

      {/* Tầng 2: Hệ thống Reviews & UGC */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 350px) 1fr', gap: '40px', marginBottom: '60px' }}>
        {/* Form Đánh giá */}
        <div style={{ background: '#f8fafc', padding: '30px', borderRadius: '20px', border: '1px solid var(--border-light)', height: 'fit-content' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1.3rem', fontWeight: '800' }}>Write a Review</h3>
          {submitError && <div style={{ color: '#ef4444', marginBottom: '15px', fontSize: '0.9rem', padding: '10px', background: '#fef2f2', borderRadius: '8px' }}>{submitError}</div>}
          <form onSubmit={submitReview} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>Rating (1-5)</label>
              <select value={rating} onChange={e => setRating(Number(e.target.value))} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', outline: 'none' }}>
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Very Good</option>
                <option value="3">3 - Average</option>
                <option value="2">2 - Poor</option>
                <option value="1">1 - Terrible</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>Your Experience</label>
              <textarea 
                required 
                placeholder="Share details of your own experience with this product..." 
                value={comment} onChange={e => setComment(e.target.value)} 
                style={{ width: '100%', padding: '12px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid var(--border-light)', outline: 'none', minHeight: '120px', resize: 'vertical' }}
              />
            </div>
            <Button type="submit">Submit Review</Button>
          </form>
        </div>

        {/* Danh sách Reviews */}
        <div>
          <h3 style={{ margin: '0 0 25px 0', fontSize: '1.6rem', fontWeight: '800' }}>Customer Reviews</h3>
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
                        <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '1.05rem' }}>{review.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{new Date(review.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                    {renderStars(review.rating)}
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-main)', lineHeight: '1.6', fontSize: '0.95rem' }}>{review.comment}</p>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', background: '#f8fafc', borderRadius: '16px', border: '2px dashed var(--border-light)' }}>
              <span style={{ fontSize: '3rem', opacity: 0.2 }}>📝</span>
              <p style={{ margin: '10px 0 0 0', color: 'var(--text-muted)' }}>No reviews yet. Be the first to review this product!</p>
            </div>
          )}
        </div>
      </div>

      {/* Tầng 3: Real-time Recommendations (AI Driven) */}
      {recommendedProducts.length > 0 && (
        <div style={{ marginBottom: '60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px' }}>
             <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '800' }}>People also Viewed</h3>
             <span style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontSize: '0.7rem', fontWeight: '800', padding: '4px 12px', borderRadius: '99px' }}>AI RECOMMENDATION</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "20px" }}>
            {recommendedProducts.map(p => (
              <div key={p.id} className="ds-glass-card" style={{ padding: '20px', borderRadius: '16px', position: 'relative', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid transparent' }} onClick={() => navigate(`/product/${p.id}`)} onMouseOver={e=>e.currentTarget.style.borderColor='var(--primary-color)'} onMouseOut={e=>e.currentTarget.style.borderColor='transparent'}>
                <div style={{ background: '#f1f5f9', borderRadius: '12px', padding: '15px', marginBottom: '15px', display: 'flex', justifyContent: 'center' }}>
                  <img src={p.image} alt={p.name} style={{ width: "120px", height: "120px", objectFit: 'contain', mixBlendMode: 'multiply' }} />
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

      {/* Tầng 4: Cross Selling (Static Category-based) */}
      {similarProducts.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 25px 0', fontSize: '1.6rem', fontWeight: '800' }}>Similar Products</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "20px" }}>
            {similarProducts.map(p => (
              <div key={p.id} className="ds-glass-card" style={{ padding: '20px', borderRadius: '16px', position: 'relative', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid transparent' }} onClick={() => navigate(`/product/${p.id}`)} onMouseOver={e=>e.currentTarget.style.borderColor='var(--primary-color)'} onMouseOut={e=>e.currentTarget.style.borderColor='transparent'}>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleWishlist(p); }} 
                  style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.9)', border: '1px solid var(--border-light)', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', zIndex: 2, fontSize: '0.9rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
                >
                  {wishlist.some(w => w.id === p.id) ? '❤️' : '🤍'}
                </button>

                <div style={{ background: '#f1f5f9', borderRadius: '12px', padding: '15px', marginBottom: '15px', display: 'flex', justifyContent: 'center' }}>
                  <img src={p.image} alt={p.name} style={{ width: "120px", height: "120px", objectFit: 'contain', mixBlendMode: 'multiply' }} />
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
        <React.Suspense fallback={<div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white' }}>Loading 3D...</div>}>
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
