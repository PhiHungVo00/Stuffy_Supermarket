import React, { useEffect, useState, useRef } from "react";
import { useCartStore } from "store/store";
import Button from "design_system/Button";
import { io } from "socket.io-client";
import FortuneWheel from "./FortuneWheel";
import CheckoutModal from "./CheckoutModal";
// @ts-ignore
import { useI18nStore } from "store/i18n";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';
const SESSION_CODE = Math.random().toString(36).substring(2, 6).toUpperCase();

const Cart = () => {
  const { t } = useI18nStore();
  const { cartItems, increaseQuantity, decreaseQuantity, removeFromCart, clearCart, addToCart, loadCartFromServer } = useCartStore();
  const [magicItem, setMagicItem] = useState(null);
  const [showWheel, setShowWheel] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  
  // Selection state
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  
  // Vouchers state
  const [shopVouchers, setShopVouchers] = useState({}); // { [shopId]: voucherObject }
  const [shopVoucherCodes, setShopVoucherCodes] = useState({}); // { [shopId]: '' }
  const [shopVoucherErrors, setShopVoucherErrors] = useState({}); // { [shopId]: '' }
  
  const [platformVoucher, setPlatformVoucher] = useState(null);
  const [shippingVoucher, setShippingVoucher] = useState(null);
  const [platformVoucherCode, setPlatformVoucherCode] = useState('');
  const [platformVoucherError, setPlatformVoucherError] = useState('');
  
  // Fortune Wheel discount
  const [discount, setDiscount] = useState(null); // { label, discount, emoji }

  // Carrier & shipping fees state
  const [selectedCarriers, setSelectedCarriers] = useState({}); // { [shopId]: carrierCode }
  const [shippingFees, setShippingFees] = useState({}); // { [shopId]: number }

  // Stuffy Coins state
  const [userCoinsBalance, setUserCoinsBalance] = useState(0);
  const [redeemCoinsChecked, setRedeemCoinsChecked] = useState(false);

  useEffect(() => {
    if (loadCartFromServer) {
      loadCartFromServer().catch(console.error);
    }
    const userInfoString = localStorage.getItem('userInfo');
    if (userInfoString) {
      try {
        const userInfo = JSON.parse(userInfoString);
        setUserCoinsBalance(userInfo.coinsBalance || 0);
      } catch (e) {}
    }
  }, []);

  const calculateLocalMockShippingFee = (carrierCode, shopDoc, weightGrams, valueAmt) => {
    const carrier = (carrierCode || 'ghn').toLowerCase();
    const baseRates = { ghn: 8.0, ghtk: 7.5, viettelpost: 9.0 };
    const base = baseRates[carrier] || 8.0;
    
    const shopProvince = (shopDoc?.province || 'Hồ Chí Minh').toLowerCase().trim();
    const destProvince = 'hồ chí minh';
    const isSameProvince = shopProvince === destProvince;
    const distanceMiles = isSameProvince ? 10 : 350;
    
    const distanceCharge = distanceMiles * 0.02;
    const weightCharge = (weightGrams / 1000) * 0.40;
    
    const totalFee = base + distanceCharge + weightCharge;
    return Math.round(totalFee * 100) / 100;
  };

  useEffect(() => {
    const getShippingFees = async () => {
      const selectedItems = cartItems.filter(item => selectedItemIds.includes(item.id));
      if (selectedItems.length === 0) {
        setShippingFees({});
        return;
      }

      const userInfoString = localStorage.getItem('userInfo');
      let token = null;
      if (userInfoString) {
        try {
          token = JSON.parse(userInfoString).token;
        } catch (e) {}
      }

      const shopGroupsForShipping = {};
      selectedItems.forEach(item => {
        const shop = item.shop || { _id: 'default_shop', name: 'Stuffy Supermarket' };
        const shopId = shop.id || shop._id || 'default_shop';
        if (!shopGroupsForShipping[shopId]) {
          shopGroupsForShipping[shopId] = [];
        }
        shopGroupsForShipping[shopId].push(item);
      });

      const fees = {};
      const apiItems = [];

      for (const [shopId, items] of Object.entries(shopGroupsForShipping)) {
        items.forEach(item => {
          apiItems.push({
            product: (item._id || item.id).split('_')[0],
            qty: item.quantity,
            price: item.price
          });
        });
      }

      if (token) {
        try {
          const res = await fetch(`${API_BASE}/api/orders/shipping-fee`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              orderItems: apiItems,
              shippingAddress: { city: 'Hồ Chí Minh', address: 'Quận 1' },
              selectedCarriers
            })
          });
          if (res.ok) {
            const data = await res.json();
            setShippingFees(data.shippingFees || {});
            return;
          }
        } catch (err) {
          console.warn('API shipping calculation failed, falling back to local calculation:', err);
        }
      }

      Object.entries(shopGroupsForShipping).forEach(([shopId, items]) => {
        const carrierCode = selectedCarriers[shopId] || 'ghn';
        const groupItemsPrice = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        const groupWeightGrams = items.reduce((acc, item) => acc + (item.quantity * 1000), 0);
        const shopDoc = shopGroups[shopId]?.shop;
        
        fees[shopId] = calculateLocalMockShippingFee(carrierCode, shopDoc, groupWeightGrams, groupItemsPrice);
      });
      setShippingFees(fees);
    };

    getShippingFees();
  }, [cartItems, selectedItemIds, selectedCarriers]);

  // Sync selectedItemIds when cartItems change (auto-select new items, remove deleted ones)
  useEffect(() => {
    const itemIds = cartItems.map(i => i.id);
    setSelectedItemIds(prev => {
      const validPrev = prev.filter(id => itemIds.includes(id));
      // If list was empty and now has items, select all
      if (validPrev.length === 0 && itemIds.length > 0) {
        return itemIds;
      }
      // If a new item was added, include it in selections
      const newItems = itemIds.filter(id => !prev.includes(id));
      if (newItems.length > 0) {
        return [...validPrev, ...newItems];
      }
      return validPrev;
    });
  }, [cartItems]);

  // Group items by shop details
  const shopGroups = {};
  cartItems.forEach(item => {
    // If shop is missing, group under a default 'Stuffy Supermarket' shop
    const shop = item.shop || { _id: 'default_shop', name: 'Stuffy Supermarket' };
    const shopId = shop.id || shop._id || 'default_shop';
    if (!shopGroups[shopId]) {
      shopGroups[shopId] = {
        shop,
        items: []
      };
    }
    shopGroups[shopId].items.push(item);
  });

  // Calculate pricing breakdown
  let totalSelectedSubtotal = 0;
  let totalShipping = 0;
  let totalShopDiscounts = 0;

  const computedGroups = Object.values(shopGroups).map(group => {
    const shopId = group.shop.id || group.shop._id || 'default_shop';
    const selectedItems = group.items.filter(item => selectedItemIds.includes(item.id));
    const subtotal = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    
    // Calculate shipping fee per shop group separately using selected carrier / API result
    let shipping = selectedItems.length > 0 ? (shippingFees[shopId] ?? 10) : 0;
    let discountAmount = 0;

    const voucher = shopVouchers[shopId];
    if (voucher && selectedItems.length > 0) {
      if (voucher.type === 'shipping') {
        shipping = 0;
      } else {
        if (voucher.discountAmount !== undefined) {
          discountAmount = voucher.discountAmount;
        } else if (voucher.discountType === 'percentage') {
          discountAmount = subtotal * (voucher.discountValue / 100);
          if (voucher.maxDiscount > 0) {
            discountAmount = Math.min(discountAmount, voucher.maxDiscount);
          }
        } else {
          discountAmount = voucher.discountValue || 0;
        }
        discountAmount = Math.min(discountAmount, subtotal);
      }
    }

    totalSelectedSubtotal += subtotal;
    totalShipping += shipping;
    totalShopDiscounts += discountAmount;

    return {
      ...group,
      selectedItems,
      subtotal,
      shipping,
      discount: discountAmount,
      total: Math.max(0, subtotal - discountAmount + shipping)
    };
  });

  // Calculate wheel discount
  let spinDiscount = 0;
  if (discount?.discount > 0) {
    spinDiscount = totalSelectedSubtotal * discount.discount;
  }

  // Calculate platform discount
  let platformDiscount = 0;
  if (platformVoucher && totalSelectedSubtotal > 0) {
    if (platformVoucher.discountAmount !== undefined) {
      platformDiscount = platformVoucher.discountAmount;
    } else if (platformVoucher.discountType === 'percentage') {
      platformDiscount = totalSelectedSubtotal * (platformVoucher.discountValue / 100);
      if (platformVoucher.maxDiscount > 0) {
        platformDiscount = Math.min(platformDiscount, platformVoucher.maxDiscount);
      }
    } else {
      platformDiscount = platformVoucher.discountValue || 0;
    }
    // Ensure platform discount doesn't exceed remaining total
    platformDiscount = Math.min(platformDiscount, totalSelectedSubtotal - totalShopDiscounts - spinDiscount);
  }

  // Calculate platform shipping discount
  let platformShippingDiscount = 0;
  if (shippingVoucher && totalShipping > 0) {
    if (shippingVoucher.discountType === 'percentage') {
      platformShippingDiscount = totalShipping * (shippingVoucher.discountValue / 100);
      if (shippingVoucher.maxDiscount > 0) {
        platformShippingDiscount = Math.min(platformShippingDiscount, shippingVoucher.maxDiscount);
      }
    } else if (shippingVoucher.discountType === 'fixed') {
      platformShippingDiscount = Math.min(totalShipping, shippingVoucher.discountValue);
    } else {
      platformShippingDiscount = totalShipping; // Default 100% free shipping
    }
  }

  // Calculate user coins redemption
  const maxRedeemableCoins = Math.min(
    userCoinsBalance,
    Math.floor(totalSelectedSubtotal * 0.25)
  );
  const coinsRedeemedVal = redeemCoinsChecked ? maxRedeemableCoins : 0;

  // Final Total
  const finalTotal = Math.max(0, totalSelectedSubtotal - totalShopDiscounts - spinDiscount - platformDiscount - platformShippingDiscount - coinsRedeemedVal + totalShipping);

  // Apply voucher API functions
  const applyShopVoucher = async (shopId, code, shopSubtotal, shopItems) => {
    setShopVoucherErrors(prev => ({ ...prev, [shopId]: '' }));
    const userInfoString = localStorage.getItem('userInfo');
    if (!userInfoString) {
      setShopVoucherErrors(prev => ({ ...prev, [shopId]: t('login_required') }));
      return;
    }
    const { token } = JSON.parse(userInfoString);
    try {
      const res = await fetch(`${API_BASE}/api/vouchers/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          code, 
          orderTotal: shopSubtotal, 
          items: shopItems.map(item => ({ product: (item._id || item.id).split('_')[0], qty: item.quantity, price: item.price }))
        })
      });
      const data = await res.json();
      if (res.ok) {
        setShopVouchers(prev => ({ ...prev, [shopId]: data }));
      } else {
        setShopVoucherErrors(prev => ({ ...prev, [shopId]: data.error || t('invalid_voucher') }));
      }
    } catch { 
      setShopVoucherErrors(prev => ({ ...prev, [shopId]: t('network_error') })); 
    }
  };

  const applyPlatformVoucher = async () => {
    setPlatformVoucherError('');
    const userInfoString = localStorage.getItem('userInfo');
    if (!userInfoString) {
      setPlatformVoucherError(t('login_required'));
      return;
    }
    const { token } = JSON.parse(userInfoString);
    try {
      const res = await fetch(`${API_BASE}/api/vouchers/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: platformVoucherCode, orderTotal: totalSelectedSubtotal })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.type === 'shipping') {
          setShippingVoucher(data);
        } else {
          setPlatformVoucher(data);
        }
        setPlatformVoucherCode('');
      } else {
        setPlatformVoucherError(data.error || t('invalid_voucher'));
      }
    } catch { 
      setPlatformVoucherError(t('network_error')); 
    }
  };

  const handleCheckout = async (shippingAddress, method = 'Credit Card (Stripe Mock)') => {
    const userInfoString = localStorage.getItem('userInfo');
    if (!userInfoString) {
      alert(t('login_required'));
      return;
    }
    const { token } = JSON.parse(userInfoString);

    // Filter only selected order items
    const selectedItems = [];
    cartItems.forEach(item => {
      if (selectedItemIds.includes(item.id)) {
        selectedItems.push({
          name: item.name,
          qty: item.quantity,
          image: item.image,
          price: item.price,
          product: (item._id || item.id).split('_')[0]
        });
      }
    });

    if (selectedItems.length === 0) {
      alert(t('select_item_checkout_alert'));
      return;
    }

    const shopVoucherCode = Object.values(shopVouchers).map(v => v.code).find(Boolean) || '';

    const orderPayload = {
      orderItems: selectedItems,
      itemsPrice: totalSelectedSubtotal,
      taxPrice: 0,
      totalPrice: finalTotal,
      paymentMethod: method,
      shippingAddress,
      voucherCode: platformVoucher?.code || '',
      shopVoucherCode: shopVoucherCode,
      shippingVoucherCode: shippingVoucher?.code || '',
      selectedCarriers,
      redeemCoins: coinsRedeemedVal
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
        const orderData = await res.json();

        // Update user coins local storage
        if (coinsRedeemedVal > 0) {
          try {
            const userInfoObj = JSON.parse(userInfoString);
            userInfoObj.coinsBalance = Math.max(0, (userInfoObj.coinsBalance || 0) - coinsRedeemedVal);
            localStorage.setItem('userInfo', JSON.stringify(userInfoObj));
            setUserCoinsBalance(userInfoObj.coinsBalance);
            setRedeemCoinsChecked(false);
          } catch (e) {}
        }
        
        // Remove only checked out items from cart
        if (selectedItemIds.length === cartItems.length) {
          clearCart();
        } else {
          selectedItemIds.forEach(id => removeFromCart(id));
        }
        
        setShowCheckout(false);

        if (method === 'VietQR') {
          // PayOS VietQR flow: generate payment link and redirect
          try {
            const payosRes = await fetch(`${API_BASE}/api/payments/payos/create-link`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify({
                parentOrderId: orderData.parentOrderId,
                originHost: window.location.origin
              })
            });
            const payosData = await payosRes.json();
            if (payosRes.ok && payosData.checkoutUrl) {
              window.location.href = payosData.checkoutUrl;
            } else {
              alert(t('error_creating_invoice') + ": " + (payosData.error || 'Failed to create payment link'));
            }
          } catch (err) {
            alert(t('network_error') + ": " + err.message);
          }
        } else {
          // Standard Stripe checkout success alert
          alert(t('order_placed_success'));
        }
      } else {
        const err = await res.json();
        alert(t('error_creating_invoice') + ": " + err.error);
      }
    } catch (e) {
      alert(t('network_error') + ": " + e.message);
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const success = params.get('success');
      const cancel = params.get('cancel');

      if (success === 'true') {
        alert("Thanh toán thành công! Đơn hàng của bạn đang được xử lý.");
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (cancel === 'true') {
        alert("Giao dịch thanh toán VietQR đã bị hủy.");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "40px" }}>
        <div>
          <h2 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>{t('your_cart')}</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1rem' }}>{cartItems.length} {cartItems.length === 1 ? t('item') : t('items')}</p>
        </div>
        {cartItems.length > 0 && (
          <button onClick={clearCart} style={{ background: 'transparent', color: '#ef4444', border: '1px solid #fca5a5', padding: '10px 20px', borderRadius: '99px', cursor: 'pointer', fontWeight: '700', transition: 'all 0.2s' }} onMouseOver={e => e.target.style.background = '#fef2f2'} onMouseOut={e => e.target.style.background = 'transparent'}>
            {t('clear_cart')}
          </button>
        )}
      </div>

      {cartItems.length === 0 ? (
        <div style={{ display: 'flex', gap: '30px', alignItems: 'stretch' }}>
          <div className="ds-glass-card" style={{ flex: 1, textAlign: 'center', padding: '80px 20px', background: '#f8fafc', border: '2px dashed var(--border-light)' }}>
            <div style={{ fontSize: '5rem', opacity: 0.1, marginBottom: '20px' }}>🛒</div>
            <h3 style={{ fontSize: '1.4rem', color: 'var(--text-main)', marginBottom: '8px', fontWeight: '700' }}>{t('cart_empty')}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>{t('browse_catalogue')}</p>
          </div>
          
          <div className="ds-glass-card" style={{ width: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: '700' }}>{t('scan_and_go')}</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.88rem', opacity: 0.75, lineHeight: 1.5 }}>{t('scan_qr_desc')}</p>
            <div style={{ padding: '10px', background: 'white', borderRadius: '12px' }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${typeof window !== 'undefined' ? window.location.origin : ''}/scanner/${SESSION_CODE}`} alt="QR Code" style={{ width: '100%', display: 'block' }} />
            </div>
            <p style={{ marginTop: '20px', fontSize: '1.1rem', letterSpacing: '2px', fontWeight: 'bold', color: '#38bdf8' }}>{t('pin')}: {SESSION_CODE}</p>
            <button
              onClick={() => window.open(`/scanner/${SESSION_CODE}`, '_blank')}
              style={{
                marginTop: '12px',
                background: 'rgba(56,189,248,0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56,189,248,0.3)',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              📱 Mở Camera quét QR ở Tab mới
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "40px", alignItems: "start" }}>
          
          {/* Left Column: Grouped Items */}
          <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
            {computedGroups.map((group) => {
              const shopId = group.shop.id || group.shop._id || 'default_shop';
              const shopName = group.shop.name || 'Stuffy Supermarket';
              const shopLogo = group.shop.logo;
              const isAllGroupSelected = group.items.every(item => selectedItemIds.includes(item.id));
              
              return (
                <div key={shopId} className="ds-glass-card" style={{ background: 'white', borderRadius: '20px', border: '1px solid var(--border-light)', overflow: 'hidden', padding: '0 0 25px 0', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: 'var(--shadow-sm)' }}>
                  
                  {/* Shop Banner Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 25px', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <input 
                        type="checkbox" 
                        checked={isAllGroupSelected} 
                        onChange={(e) => {
                          const groupItemIds = group.items.map(i => i.id);
                          if (e.target.checked) {
                            setSelectedItemIds(prev => [...new Set([...prev, ...groupItemIds])]);
                          } else {
                            setSelectedItemIds(prev => prev.filter(id => !groupItemIds.includes(id)));
                          }
                        }}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      
                      {shopLogo ? (
                        <img src={shopLogo} alt={shopName} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>
                          {shopName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)' }}>{shopName}</h4>
                        <span style={{ fontSize: '0.7rem', background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '99px', fontWeight: '700' }}>{t('verified_shop')}</span>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('carrier')}</span>
                        <select 
                          value={selectedCarriers[shopId] || 'ghn'} 
                          onChange={(e) => setSelectedCarriers(prev => ({ ...prev, [shopId]: e.target.value }))}
                          style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.78rem', fontWeight: '600', background: 'white', cursor: 'pointer', outline: 'none' }}
                        >
                          <option value="ghn">GHN (Standard)</option>
                          <option value="ghtk">GHTK (Fast)</option>
                          <option value="viettelpost">Viettel Post</option>
                        </select>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('shipping')} </span>
                        <span style={{ fontSize: '0.88rem', fontWeight: '700', color: group.shipping === 0 ? '#16a34a' : 'var(--text-main)' }}>
                          {group.shipping === 0 ? t('free') : `$${group.shipping.toFixed(2)}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Shop Items List */}
                  <div style={{ padding: '0 25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {group.items.map((item) => {
                      const isSelected = selectedItemIds.includes(item.id);
                      return (
                        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 0", borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <input 
                              type="checkbox" 
                              checked={isSelected} 
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedItemIds(prev => [...prev, item.id]);
                                } else {
                                  setSelectedItemIds(prev => prev.filter(id => id !== item.id));
                                }
                              }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <div style={{ width: '70px', height: '70px', background: '#f8fafc', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px' }}>
                              <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                            </div>
                            <div>
                              <h4 style={{ margin: "0 0 4px 0", fontSize: "1.1rem", fontWeight: '700', color: 'var(--text-main)' }}>{item.name}</h4>
                              <p style={{ margin: 0, color: "var(--text-muted)", fontWeight: "500", fontSize: '0.8rem', display: 'inline-block', marginRight: '10px' }}>SKU: #{item.id?.substring(0,8) || 'N/A'}</p>
                              {item.selectedVariant && item.selectedVariant.attributes && (
                                <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', verticalAlign: 'middle' }}>
                                  {Object.entries(item.selectedVariant.attributes).map(([key, val]) => val ? (
                                    <span key={key} style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', textTransform: 'capitalize', fontWeight: '600' }}>
                                      {key}: {val}
                                    </span>
                                  ) : null)}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div style={{ display: "flex", alignItems: "center", gap: '25px' }}>
                            <p style={{ margin: 0, color: "var(--text-main)", fontWeight: "800", fontSize: '1.2rem' }}>${item.price}</p>
                            
                            {/* Quantity Controls */}
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f1f5f9", padding: "4px 8px", borderRadius: "99px", border: "1px solid var(--border-light)" }}>
                              <button onClick={() => decreaseQuantity(item.id)} style={{ background: "white", border: "none", color: "var(--text-main)", cursor: "pointer", fontSize: "1rem", width: '26px', height: '26px', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                              <span style={{ fontWeight: "700", width: "20px", textAlign: "center", color: "var(--text-main)", fontSize: '0.9rem' }}>{item.quantity}</span>
                              <button onClick={() => increaseQuantity(item.id)} style={{ background: "white", border: "none", color: "var(--text-main)", cursor: "pointer", fontSize: "1rem", width: '26px', height: '26px', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                            </div>
                            
                            <button onClick={() => removeFromCart(item.id)} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: '1.5rem', padding: '5px' }} onMouseOver={e => e.target.style.color = '#ef4444'} onMouseOut={e => e.target.style.color = '#94a3b8'}>
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Shop Voucher Section */}
                  <div style={{ padding: '0 25px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', maxWidth: '350px' }}>
                      <input 
                        type="text" 
                        placeholder={t('shop_voucher_code')} 
                        value={shopVoucherCodes[shopId] || ''} 
                        onChange={e => setShopVoucherCodes(prev => ({ ...prev, [shopId]: e.target.value.toUpperCase() }))} 
                        style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem', fontWeight: '600' }} 
                      />
                      <button 
                        onClick={() => applyShopVoucher(shopId, shopVoucherCodes[shopId], group.subtotal, group.items)} 
                        disabled={!shopVoucherCodes[shopId] || group.subtotal === 0} 
                        style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: 'var(--primary-color)', color: 'white', fontWeight: '700', cursor: shopVoucherCodes[shopId] && group.subtotal > 0 ? 'pointer' : 'not-allowed', fontSize: '0.8rem', opacity: shopVoucherCodes[shopId] && group.subtotal > 0 ? 1 : 0.5 }}
                      >
                        {t('apply')}
                      </button>
                    </div>
                    {shopVoucherErrors[shopId] && <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#ef4444' }}>{shopVoucherErrors[shopId]}</p>}
                    {shopVouchers[shopId] && (
                      <div style={{ marginTop: '4px', padding: '6px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '350px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#15803d' }}>
                          {t('applied')}: {shopVouchers[shopId].code} (-${shopVouchers[shopId].discountAmount?.toFixed(2) || 0})
                        </span>
                        <button onClick={() => {
                          setShopVouchers(prev => {
                            const next = { ...prev };
                            delete next[shopId];
                            return next;
                          });
                          setShopVoucherCodes(prev => ({ ...prev, [shopId]: '' }));
                        }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
                      </div>
                    )}
                  </div>
                  
                </div>
              );
            })}
          </div>

          {/* Right Column: Order Summary */}
          <div className="ds-glass-card" style={{ position: 'sticky', top: '120px', background: 'white', overflow: 'hidden' }}>
            <h3 style={{ margin: '0 0 25px 0', fontSize: '1.2rem', fontWeight: '700' }}>{t('order_summary')}</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '1rem' }}>{t('subtotal')} ({selectedItemIds.length} {selectedItemIds.length === 1 ? t('item') : t('items')})</span>
              <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>${totalSelectedSubtotal.toFixed(2)}</span>
            </div>
            {totalShopDiscounts > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', color: '#16a34a' }}>
                <span style={{ fontSize: '1rem' }}>{t('shop_discounts')}</span>
                <span style={{ fontWeight: '700' }}>-${totalShopDiscounts.toFixed(2)}</span>
              </div>
            )}
            {spinDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', color: '#16a34a' }}>
                <span style={{ fontSize: '1rem' }}>{t('wheel_discount')}</span>
                <span style={{ fontWeight: '700' }}>-${spinDiscount.toFixed(2)}</span>
              </div>
            )}
            {platformDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', color: '#16a34a' }}>
                <span style={{ fontSize: '1rem' }}>{t('platform_discount')}</span>
                <span style={{ fontWeight: '700' }}>-${platformDiscount.toFixed(2)}</span>
              </div>
            )}
            {platformShippingDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', color: '#16a34a' }}>
                <span style={{ fontSize: '1rem' }}>{t('shipping_discount') || 'Shipping Discount'}</span>
                <span style={{ fontWeight: '700' }}>-${platformShippingDiscount.toFixed(2)}</span>
              </div>
            )}
            {coinsRedeemedVal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', color: '#16a34a' }}>
                <span style={{ fontSize: '1rem' }}>{t('coins_redeemed')}</span>
                <span style={{ fontWeight: '700' }}>-${coinsRedeemedVal.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '1rem' }}>{t('tax')}</span>
              <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>$0.00</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '1rem' }}>{t('shipping_total')}</span>
              <span style={{ fontWeight: '700', color: totalShipping === 0 ? '#16a34a' : 'var(--text-main)' }}>
                {totalShipping === 0 ? t('free') : `$${totalShipping.toFixed(2)}`}
              </span>
            </div>
            
            {/* Wheel Discount Applied Badge */}
            {discount && (
              <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #86efac', borderRadius: '12px', padding: '12px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#15803d' }}>{discount.emoji} {discount.label}</span>
                <button onClick={() => setDiscount(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
              </div>
            )}

            <div style={{ borderTop: '1px dashed var(--border-light)', margin: '20px 0' }}></div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-muted)' }}>{t('total')}</span>
              <div style={{ textAlign: 'right' }}>
                {(discount?.discount > 0 || totalShopDiscounts > 0 || platformDiscount > 0 || platformShippingDiscount > 0) && (
                  <div style={{ fontSize: '1rem', fontWeight: '700', color: '#94a3b8', textDecoration: 'line-through' }}>${(totalSelectedSubtotal + totalShipping).toFixed(2)}</div>
                )}
                <span style={{ fontSize: '2.5rem', fontWeight: '900', color: (discount?.discount > 0 || totalShopDiscounts > 0 || platformDiscount > 0 || platformShippingDiscount > 0) ? '#16a34a' : 'var(--primary-color)', letterSpacing: '-1px' }}>${finalTotal.toFixed(2)}</span>
              </div>
            </div>
            
            {/* Fortune Wheel Button */}
            {!discount && (
              <button onClick={() => setShowWheel(true)} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '2px dashed #a5b4fc', background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)', color: '#6366f1', fontWeight: '800', cursor: 'pointer', fontSize: '1rem', marginBottom: '12px', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#e0e7ff'} onMouseOut={e => e.currentTarget.style.background = 'linear-gradient(135deg,#eef2ff,#f5f3ff)'}>
              {t('spin_for_discount')}
              </button>
            )}

            {/* Platform Voucher Input */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" placeholder={t('platform_voucher')} value={platformVoucherCode} onChange={e => setPlatformVoucherCode(e.target.value.toUpperCase())} style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem', fontWeight: '600' }} />
                <button onClick={applyPlatformVoucher} disabled={!platformVoucherCode} style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'var(--primary-color)', color: 'white', fontWeight: '700', cursor: platformVoucherCode ? 'pointer' : 'not-allowed', fontSize: '0.85rem', opacity: platformVoucherCode ? 1 : 0.5 }}>{t('apply')}</button>
              </div>
              {platformVoucherError && <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#ef4444' }}>{platformVoucherError}</p>}
              {platformVoucher && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#15803d' }}>
                    🎟️ {t('platform_discount')}: {platformVoucher.code} (-${platformVoucher.discountAmount?.toFixed(2)})
                  </span>
                  <button onClick={() => { setPlatformVoucher(null); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
                </div>
              )}
              {shippingVoucher && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#15803d' }}>
                    🚚 {t('free_shipping_options') || 'Miễn phí vận chuyển'}: {shippingVoucher.code}
                  </span>
                  <button onClick={() => { setShippingVoucher(null); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
                </div>
              )}
            </div>

            {/* Stuffy Coins Wallet Redemption */}
            {userCoinsBalance > 0 && (
              <div style={{ marginBottom: '15px', padding: '12px 16px', background: '#f8fafc', border: '1px solid var(--border-light)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="checkbox" 
                    id="redeem-coins-checkbox"
                    checked={redeemCoinsChecked} 
                    onChange={(e) => setRedeemCoinsChecked(e.target.checked)} 
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="redeem-coins-checkbox" style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-main)', cursor: 'pointer' }}>
                    {t('redeem_stuffy_coins')}
                  </label>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('available_label')}</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#6366f1' }}>{userCoinsBalance}</span>
                  {redeemCoinsChecked && maxRedeemableCoins > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: '700' }}>
                      -${maxRedeemableCoins}
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button onClick={() => setShowCheckout(true)} disabled={selectedItemIds.length === 0} style={{ width: "100%", fontSize: "1.1rem", padding: "18px", borderRadius: '16px' }}>
              {t('proceed_to_checkout')}
            </Button>
            
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', margin: '16px 0 0 0' }}>
              {t('secured_by')}
            </p>

            <div style={{ marginTop: '25px', padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${typeof window !== 'undefined' ? window.location.origin : ''}/scanner/${SESSION_CODE}`} alt="QR Code Mini" style={{ width: '60px', height: '60px', borderRadius: '8px' }} />
              <div>
                <p style={{ margin: '0 0 3px 0', fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-main)' }}>{t('scan_and_go')}</p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('session_pin')}: <strong style={{color: 'var(--primary-color)', letterSpacing: '1px'}}>{SESSION_CODE}</strong></p>
                <button
                  onClick={() => window.open(`/scanner/${SESSION_CODE}`, '_blank')}
                  style={{
                    marginTop: '6px',
                    background: 'rgba(99,102,241,0.1)',
                    color: '#6366f1',
                    border: '1px solid rgba(99,102,241,0.2)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'block'
                  }}
                >
                  📱 Quét QR bằng Camera
                </button>
              </div>
            </div>
          </div>
          
        </div>
      )}

      {/* Fortune Wheel Modal */}
      {showWheel && (
        <FortuneWheel
          total={totalSelectedSubtotal}
          onApplyDiscount={(result) => setDiscount(result)}
          onClose={() => setShowWheel(false)}
        />
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <CheckoutModal 
          total={finalTotal}
          breakdown={{
            subtotal: totalSelectedSubtotal,
            shipping: totalShipping,
            shopDiscounts: totalShopDiscounts,
            spinDiscount: spinDiscount,
            platformDiscount: platformDiscount,
            shippingDiscount: platformShippingDiscount,
            coinsDiscount: coinsRedeemedVal
          }}
          onCheckout={handleCheckout}
          onClose={() => setShowCheckout(false)}
        />
      )}
    </div>
  );
};

export default Cart;