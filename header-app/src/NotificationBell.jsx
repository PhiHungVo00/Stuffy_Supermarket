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
    // 1. Kết nối với Backend API Backend
    const socket = io("https://stuffy-backend-api.onrender.com");

    const addNotification = (notif) => {
      setNotifications(prev => [notif, ...prev]);
      setUnreadCount(prev => prev + 1);
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
        message: `Đơn hàng #${data.orderId} của bạn đã chuyển trạng thái: ${data.status}`,
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
        style={{ background: 'none', border: 'none', position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '45px', height: '45px', borderRadius: '50%', transition: 'background 0.2s', fontSize: '1.5rem', color: '#64748b' }}
        onMouseOver={e=>e.currentTarget.style.background='#f1f5f9'}
        onMouseOut={e=>e.currentTarget.style.background='none'}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: '5px', right: '5px', background: '#ef4444', color: 'white', borderRadius: '50%', minWidth: '18px', height: '18px', fontSize: '0.7rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 4px', border: '2px solid white', animation: 'bounce 1s infinite' }}>
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
