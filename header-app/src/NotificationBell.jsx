import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
// @ts-ignore
import { useI18nStore } from 'store/i18n';

export default function NotificationBell() {
  const { t } = useI18nStore();
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const dropdownRef = useRef(null);

  useEffect(() => {
    const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
    const API_BASE = isProduction ? 'https://stuffy-backend-api-xmln.onrender.com' : 'http://localhost:5000';

    // Helper to convert base64 VAPID key to Uint8Array
    const urlBase64ToUint8Array = (base64String) => {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    };

    const subscribeUserToPush = async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          console.warn('[WebPush] Push notifications not supported in this browser.');
          return;
        }

        // Wait for service worker to be ready
        const registration = await navigator.serviceWorker.ready;
        
        // Get subscription if already exists
        let subscription = await registration.pushManager.getSubscription();
        
        // Fetch VAPID public key
        const response = await fetch(`${API_BASE}/api/notifications/vapid-public-key`);
        const data = await response.json();
        const publicKey = data.publicKey;
        
        if (!publicKey) {
          console.error('[WebPush] VAPID public key not found');
          return;
        }

        const convertedVapidKey = urlBase64ToUint8Array(publicKey);

        if (!subscription) {
          // Subscribe new user
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
          });
          console.log('[WebPush] New subscription created:', subscription);
        }

        // Send subscription to backend
        const userInfoRaw = localStorage.getItem('userInfo');
        const token = userInfoRaw ? JSON.parse(userInfoRaw).token : null;
        if (!token) {
          console.log('[WebPush] User not logged in, skipping subscription sync.');
          return;
        }

        await fetch(`${API_BASE}/api/notifications/subscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ subscription })
        });
        console.log('[WebPush] Subscription synced with backend successfully.');
      } catch (err) {
        console.error('[WebPush] Error subscribing to push notifications:', err);
      }
    };

    // Request permission for browser notifications
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            subscribeUserToPush();
          }
        });
      } else if (Notification.permission === 'granted') {
        subscribeUserToPush();
      }
    }

    const socket = io(API_BASE);

    const addNotification = (notif) => {
      setNotifications(prev => [notif, ...prev]);
      setUnreadCount(prev => prev + 1);

      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          try {
            new Notification(notif.title, {
              body: notif.message,
              icon: '/favicon.ico'
            });
          } catch (e) {
            console.error('Error showing browser notification:', e);
          }
        }
      }
    };

    // Simulate Fake Historic notifications for testing
    setNotifications([
      { id: '1', title: 'Hoàn tất cập nhật', message: 'Hệ thống đã triển khai MFE mới thành công!', time: new Date().toISOString(), read: false },
      { id: '2', title: 'Tặng Voucher', message: 'Bạn có 1 mã giảm giá FREESHIP sắp hết hạn trong 12h!', time: new Date(Date.now() - 3600000).toISOString(), read: true }
    ]);
    setUnreadCount(1);

    // 2. Lắng nghe các sự kiện Realtime từ Server
    socket.on('NEW_PRODUCT', (product) => {
      addNotification({
        id: Date.now().toString(),
        title: 'Sản phẩm mới!',
        message: `${product.name} vừa được thêm lên kệ!`,
        time: new Date().toISOString(),
        read: false
      });
    });

    socket.on('ORDER_STATUS_UPDATE', (data) => {
      addNotification({
        id: Date.now().toString(),
        title: 'Cập nhật đơn hàng',
        message: `Đơn hàng #${data.orderId.slice(-8).toUpperCase()} của bạn đã chuyển trạng thái: ${data.status}`,
        time: new Date().toISOString(),
        read: false
      });
    });

    // Handle click outside to close dropdown
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    
    return () => {
      socket.disconnect();
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleToggle = () => {
    setShowDropdown(!showDropdown);
    if (!showDropdown) {
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({...n, read: true})));
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button 
        onClick={handleToggle}
        aria-label={unreadCount > 0 ? `${t('notifications') || 'Notifications'}, ${unreadCount} unread` : (t('notifications') || 'Notifications')}
        style={{ 
          background: '#f8fafc', border: '1px solid #e2e8f0', position: 'relative', cursor: 'pointer', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: '45px', height: '45px', 
          borderRadius: '14px', transition: 'background 0.2s', color: '#1e293b' 
        }}
        onMouseOver={e=>e.currentTarget.style.background='#f1f5f9'}
        onMouseOut={e=>e.currentTarget.style.background='#f8fafc'}
      >
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
        {unreadCount > 0 && (
          <span aria-hidden="true" style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#dc2626', color: 'white', borderRadius: '50%', minWidth: '18px', height: '18px', fontSize: '0.7rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 4px', border: '2px solid white', animation: 'bounce 1s infinite', boxShadow: '0 2px 4px rgba(220, 38, 38, 0.3)' }}>
            {unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div style={{ position: 'absolute', top: '55px', right: '0', width: '380px', background: 'white', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', border: '1px solid var(--border-light)', zIndex: 1000, overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800' }}>{t('notifications')}</h4>
            <span style={{ fontSize: '0.8rem', color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 'bold' }}>{t('mark_all_read')}</span>
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '10px' }}>💤</div>
                {t('no_new_notifications')}
              </div>
            ) : (
              notifications.map((notif) => (
                <div key={notif.id} style={{ padding: '15px 20px', borderBottom: '1px solid #f1f5f9', background: notif.read ? 'white' : '#f8fafc', display: 'flex', gap: '15px', cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={e=>e.currentTarget.style.background='#f1f5f9'} onMouseOut={e=>e.currentTarget.style.background=notif.read ? 'white' : '#f8fafc'}>
                  <div style={{ width: '10px', display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
                     {!notif.read && <div style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }}></div>}
                  </div>
                  <div>
                    <h5 style={{ margin: '0 0 5px 0', fontSize: '0.95rem', color: 'var(--text-main)', fontWeight: notif.read ? '600' : '800' }}>{notif.title}</h5>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>{notif.message}</p>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginTop: '5px' }}>{new Date(notif.time).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div style={{ padding: '15px', textAlign: 'center', borderTop: '1px solid var(--border-light)', cursor: 'pointer', color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '0.9rem' }} onMouseOver={e=>e.target.style.background='#f8fafc'} onMouseOut={e=>e.target.style.background='white'}>
            {t('view_previous_notifications')}
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
