import React, { useEffect, useState, useRef } from "react";
import { useCartStore } from "store/store";
import Button from "design_system/Button";
import { io } from "socket.io-client";
import FortuneWheel from "./FortuneWheel";
import CheckoutModal from "./CheckoutModal";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';
const SESSION_CODE = Math.random().toString(36).substring(2, 6).toUpperCase();

const Cart = () => {
  const { cartItems, increaseQuantity, decreaseQuantity, removeFromCart, clearCart, addToCart } = useCartStore();
  const [magicItem, setMagicItem] = useState(null);
  const [showWheel, setShowWheel] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [discount, setDiscount] = useState(null); // { label, discount, emoji, ... }
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherApplied, setVoucherApplied] = useState(null);
  const [voucherError, setVoucherError] = useState('');
  
  const rawTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const voucherDiscount = voucherApplied?.discountAmount || 0;
  const total = (discount?.discount > 0 ? rawTotal * (1 - discount.discount) : rawTotal) - voucherDiscount;

  const applyVoucher = async () => {
    setVoucherError('');
    const userInfoString = localStorage.getItem('userInfo');
    if (!userInfoString) { setVoucherError('Please login first'); return; }
    const { token } = JSON.parse(userInfoString);
    try {
      const res = await fetch(`${API_BASE}/api/vouchers/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: voucherCode, orderTotal: rawTotal })
      });
      const data = await res.json();
      if (res.ok) {
        setVoucherApplied(data);
      } else {
        setVoucherError(data.error || 'Invalid voucher');
      }
    } catch { setVoucherError('Network error'); }
  };

  const handleCheckout = async (shippingAddress) => {
    const userInfoString = localStorage.getItem('userInfo');
    if (!userInfoString) {
      alert("Vui lòng đăng nhập (Login) trước khi Checkout!");
      return;
    }
    const { token } = JSON.parse(userInfoString);

    const orderPayload = {
      orderItems: cartItems.map(item => ({
        name: item.name,
        qty: item.quantity,
        image: item.image,
        price: item.price,
        product: item.id
      })),
      itemsPrice: rawTotal,
      taxPrice: 0,
      totalPrice: total,
      paymentMethod: 'Credit Card (Stripe Mock)',
      shippingAddress
    };

    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(orderPayload)
      });
      if (res.ok) {
        alert("🎉 Đặt hàng thành công! Hóa đơn đã được lưu vào hệ thống Database.");
        clearCart();
        setShowCheckout(false);
      } else {
        const err = await res.json();
        alert("Lỗi khi tạo hóa đơn: " + err.error);
      }
    } catch (e) {
      alert("Lỗi mạng: " + e.message);
    }
  };

  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(API_BASE);
    socketRef.current = socket;

    socket.emit("JOIN_CART_SESSION", SESSION_CODE);
    
    socket.on("DESKTOP_RECEIVE_ITEM", (product) => {
      addToCart(product);
      setMagicItem(product);
      setTimeout(() => setMagicItem(null), 2500);
    });

    return () => {
      socket.off("DESKTOP_RECEIVE_ITEM");
      socket.disconnect();
    };
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "40px" }}>
        <div>
          <h2 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>Your Cart</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1rem' }}>{cartItems.length} {cartItems.length === 1 ? 'item' : 'items'}</p>
        </div>
        {cartItems.length > 0 && (
          <button onClick={clearCart} style={{ background: 'transparent', color: '#ef4444', border: '1px solid #fca5a5', padding: '10px 20px', borderRadius: '99px', cursor: 'pointer', fontWeight: '700', transition: 'all 0.2s' }} onMouseOver={e => e.target.style.background = '#fef2f2'} onMouseOut={e => e.target.style.background = 'transparent'}>
            Clear cart
          </button>
        )}
      </div>

      {cartItems.length === 0 ? (
        <div style={{ display: 'flex', gap: '30px', alignItems: 'stretch' }}>
          <div className="ds-glass-card" style={{ flex: 1, textAlign: 'center', padding: '80px 20px', background: '#f8fafc', border: '2px dashed var(--border-light)' }}>
            <div style={{ fontSize: '5rem', opacity: 0.1, marginBottom: '20px' }}>🛒</div>
            <h3 style={{ fontSize: '1.4rem', color: 'var(--text-main)', marginBottom: '8px', fontWeight: '700' }}>Your cart is empty</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Browse the product catalogue to add items.</p>
          </div>
          
          <div className="ds-glass-card" style={{ width: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: '700' }}>Scan & Go</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.88rem', opacity: 0.75, lineHeight: 1.5 }}>Scan this QR code with your phone to add products remotely.</p>
            <div style={{ padding: '10px', background: 'white', borderRadius: '12px' }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${typeof window !== 'undefined' ? window.location.origin : ''}/scanner/${SESSION_CODE}`} alt="QR Code" style={{ width: '100%', display: 'block' }} />
            </div>
            <p style={{ marginTop: '20px', fontSize: '1.1rem', letterSpacing: '2px', fontWeight: 'bold', color: '#38bdf8' }}>PIN: {SESSION_CODE}</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "40px", alignItems: "start" }}>
          
          {/* Cột Trái: Danh sách Hàng */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {cartItems.map((item) => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 25px", background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '25px' }}>
                  <div style={{ width: '90px', height: '90px', background: '#f8fafc', borderRadius: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
                    <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 5px 0", fontSize: "1.3rem", fontWeight: '700', color: 'var(--text-main)' }}>{item.name}</h4>
                    <p style={{ margin: 0, color: "var(--text-muted)", fontWeight: "500", fontSize: '0.9rem' }}>SKU: #{item.id?.substring(0,8) || 'N/A'}</p>
                  </div>
                </div>
                
                <div style={{ display: "flex", alignItems: "center", gap: "40px" }}>
                  <p style={{ margin: 0, color: "var(--text-main)", fontWeight: "800", fontSize: '1.4rem' }}>${item.price}</p>
                  
                  {/* Bộ phím Tăng Giảm Số Lượng UI cực Pro */}
                  <div style={{ display: "flex", alignItems: "center", gap: "15px", background: "#f1f5f9", padding: "6px", borderRadius: "99px", border: "1px solid var(--border-light)" }}>
                    <button onClick={() => decreaseQuantity(item.id)} style={{ background: "white", border: "none", color: "var(--text-main)", cursor: "pointer", fontSize: "1.2rem", width: '32px', height: '32px', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}>−</button>
                    <span style={{ fontWeight: "800", width: "24px", textAlign: "center", color: "var(--text-main)" }}>{item.quantity}</span>
                    <button onClick={() => increaseQuantity(item.id)} style={{ background: "white", border: "none", color: "var(--text-main)", cursor: "pointer", fontSize: "1.2rem", width: '32px', height: '32px', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}>+</button>
                  </div>
                  
                  {/* Nút Xóa Hàng Tinh Tế */}
                  <button onClick={() => removeFromCart(item.id)} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: '1.8rem', padding: '5px', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#ef4444'} onMouseOut={e => e.target.style.color = '#94a3b8'}>
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Cột Phải: Bảng Tóm Tắt Checkout */}
          <div className="ds-glass-card" style={{ position: 'sticky', top: '120px', background: 'white', overflow: 'hidden' }}>
            <h3 style={{ margin: '0 0 25px 0', fontSize: '1.2rem', fontWeight: '700' }}>Order Summary</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '1rem' }}>Subtotal ({cartItems.length} items)</span>
              <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>${rawTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '1rem' }}>Tax (0%)</span>
              <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>$0.00</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '1rem' }}>Shipping</span>
              <span style={{ fontWeight: '700', color: '#16a34a' }}>Free</span>
            </div>
            
            {/* Hiển thị nếu đang có Ưu đãi Vòng Quay */}
            {discount && (
              <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #86efac', borderRadius: '12px', padding: '12px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#15803d' }}>{discount.emoji} {discount.label}</span>
                <button onClick={() => setDiscount(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
              </div>
            )}

            <div style={{ borderTop: '1px dashed var(--border-light)', margin: '20px 0' }}></div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-muted)' }}>Total</span>
              <div style={{ textAlign: 'right' }}>
                {discount?.discount > 0 && (
                  <div style={{ fontSize: '1rem', fontWeight: '700', color: '#94a3b8', textDecoration: 'line-through' }}>${rawTotal.toFixed(2)}</div>
                )}
                <span style={{ fontSize: '2.5rem', fontWeight: '900', color: discount?.discount > 0 ? '#16a34a' : 'var(--primary-color)', letterSpacing: '-1px' }}>${total.toFixed(2)}</span>
              </div>
            </div>
            
            {/* Nút Vòng Quay May Mắn */}
            {!discount && (
              <button onClick={() => setShowWheel(true)} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '2px dashed #a5b4fc', background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)', color: '#6366f1', fontWeight: '800', cursor: 'pointer', fontSize: '1rem', marginBottom: '12px', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#e0e7ff'} onMouseOut={e => e.currentTarget.style.background = 'linear-gradient(135deg,#eef2ff,#f5f3ff)'}>
              Spin for a discount
              </button>
            )}

            {/* Voucher Code Input */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" placeholder="Voucher code" value={voucherCode} onChange={e => setVoucherCode(e.target.value.toUpperCase())} style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem', fontWeight: '600' }} />
                <button onClick={applyVoucher} disabled={!voucherCode} style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'var(--primary-color)', color: 'white', fontWeight: '700', cursor: voucherCode ? 'pointer' : 'not-allowed', fontSize: '0.85rem', opacity: voucherCode ? 1 : 0.5 }}>Apply</button>
              </div>
              {voucherError && <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#ef4444' }}>{voucherError}</p>}
              {voucherApplied && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#15803d' }}>{voucherApplied.code}: -${voucherApplied.discountAmount?.toFixed(2)}</span>
                  <button onClick={() => { setVoucherApplied(null); setVoucherCode(''); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>x</button>
                </div>
              )}
            </div>

            <Button onClick={() => setShowCheckout(true)} style={{ width: "100%", fontSize: "1.1rem", padding: "18px", borderRadius: '16px' }}>
              Proceed to Checkout
            </Button>
            
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', margin: '16px 0 0 0' }}>
              Secured by Apple Pay / Stripe.
            </p>

            {/* QR Code thu nhỏ vẫn duy trì để khách ném thêm đồ */}
            <div style={{ marginTop: '25px', padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${typeof window !== 'undefined' ? window.location.origin : ''}/scanner/${SESSION_CODE}`} alt="QR Code Mini" style={{ width: '60px', height: '60px', borderRadius: '8px' }} />
              <div>
                <p style={{ margin: '0 0 3px 0', fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-main)' }}>Scan & Go</p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Session PIN: <strong style={{color: 'var(--primary-color)', letterSpacing: '1px'}}>{SESSION_CODE}</strong></p>
              </div>
            </div>
          </div>
          
        </div>
      )}

      {/* Modal Vòng Quay May Mắn */}
      {showWheel && (
        <FortuneWheel
          total={rawTotal}
          onApplyDiscount={(result) => setDiscount(result)}
          onClose={() => setShowWheel(false)}
        />
      )}

      {/* Modal Thanh Toán An Toàn */}
      {showCheckout && (
        <CheckoutModal 
          total={total}
          onCheckout={handleCheckout}
          onClose={() => setShowCheckout(false)}
        />
      )}
    </div>
  );
};

export default Cart;