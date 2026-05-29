import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
// @ts-ignore
import { isDarkMode } from "store/signals";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';

export default function FlashSaleBanner() {
  const [timeLeft, setTimeLeft] = useState(0); 
  const [bannerBg, setBannerBg] = useState("");
  const socketRef = useRef(null);

  useEffect(() => {
    // 🎨 Dynamic AI Visual Fetch
    const theme = isDarkMode.value ? 'dark' : 'bright';
    fetch(`${API_BASE}/api/marketing/dynamic-visual?productName=High%20End%20Gaming%20PC&theme=${theme}`)
      .then(res => res.json())
      .then(data => setBannerBg(data.imageUrl))
      .catch(err => console.error("Dynamic Banner Error:", err));

    // Kết nối tới backend socket
    socketRef.current = io(API_BASE);
    
    socketRef.current.on('FLASH_SALE_TICK', (serverTime) => {
      setTimeLeft(serverTime);
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return { h, m, s };
  };

  const { h, m, s } = formatTime(timeLeft);

  return (
    <div style={{
      width: '100%',
      backgroundImage: bannerBg ? `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.7)), url(${bannerBg})` : 'linear-gradient(45deg, #ef4444, #f97316)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      borderRadius: '24px',
      padding: '40px 50px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxSizing: 'border-box',
      boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
      color: 'white',
      marginBottom: '40px',
      transition: 'all 0.8s ease'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ fontSize: '2.5rem' }}>⚡</div>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>Flash Sale Madness</h3>
          <p style={{ margin: '5px 0 0 0', opacity: 0.9, fontSize: '0.95rem' }}>Up to 50% OFF on selected tech gear. Don't miss out!</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.9rem', letterSpacing: '0.5px' }}>Ends in:</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ background: '#7f1d1d', padding: '10px 14px', borderRadius: '8px', fontWeight: '800', fontSize: '1.2rem', minWidth: '45px', textAlign: 'center' }}>{h}</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', alignSelf: 'center' }}>:</div>
          <div style={{ background: '#7f1d1d', padding: '10px 14px', borderRadius: '8px', fontWeight: '800', fontSize: '1.2rem', minWidth: '45px', textAlign: 'center' }}>{m}</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', alignSelf: 'center' }}>:</div>
          <div style={{ background: '#7f1d1d', padding: '10px 14px', borderRadius: '8px', fontWeight: '800', fontSize: '1.2rem', minWidth: '45px', textAlign: 'center' }}>{s}</div>
        </div>
      </div>
    </div>
  );
}
