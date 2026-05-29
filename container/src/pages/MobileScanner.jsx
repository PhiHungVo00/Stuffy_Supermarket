import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";

const socket = io("https://stuffy-backend-api.onrender.com");

// Mobile device view: simulates a barcode scanner on a phone screen
export default function MobileScanner() {
  const { sessionCode } = useParams();
  const [products, setProducts] = useState([]);
  const [scannedId, setScannedId] = useState(null);

  useEffect(() => {
    // Fetch product catalogue from API
    fetch("https://stuffy-backend-api.onrender.com/api/products")
      .then(res => res.json())
      .then(data => setProducts(data.products || (Array.isArray(data) ? data : [])));
      
    // Join the socket session channel
    socket.emit("JOIN_CART_SESSION", sessionCode);
  }, [sessionCode]);

  const handleScan = (product) => {
    // Vibrate on tap (supported on most mobile browsers)
    if (navigator.vibrate) navigator.vibrate(50);
    
    // Emit the scanned product to the desktop session
    socket.emit("MOBILE_SCAN_ITEM", { sessionCode, product });
    
    setScannedId(product.id);
    setTimeout(() => setScannedId(null), 800);
  };

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', background: '#0f172a', minHeight: '100vh', padding: '20px', color: 'white', borderRadius: '30px' }}>
      <div style={{ textAlign: 'center', marginBottom: '30px', marginTop: '10px' }}>
        <h2 style={{ fontSize: '1.3rem', margin: '0 0 5px 0', fontWeight: '700' }}>Scan & Go</h2>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>Session: <strong style={{color: '#22c55e', letterSpacing: '2px'}}>{sessionCode}</strong></p>
      </div>

      <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '24px', textAlign: 'center' }}>
        <p style={{ margin: 0, opacity: 0.55, fontSize: '0.88rem' }}>Tap any product to add it to the cart on the connected device.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {products.map(p => {
          const isScanning = scannedId === p.id;
          return (
            <div 
              key={p.id} 
              onClick={() => handleScan(p)}
              style={{ 
                background: isScanning ? '#22c55e' : 'rgba(255,255,255,0.1)', 
                padding: '15px', 
                borderRadius: '12px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '15px',
                transition: 'all 0.2s',
                transform: isScanning ? 'scale(0.95)' : 'scale(1)',
                cursor: 'pointer'
              }}
            >
              <img src={p.image} style={{ width: '50px', height: '50px', background: 'white', borderRadius: '8px', objectFit: 'contain' }} />
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 5px 0', fontSize: '1.1rem', color: isScanning ? '#000' : 'white' }}>{p.name}</h4>
                <p style={{ margin: 0, color: isScanning ? 'rgba(0,0,0,0.6)' : '#a855f7', fontWeight: 'bold' }}>${p.price}</p>
              </div>
              <div style={{ fontSize: '1.2rem', color: isScanning ? '#000' : '#64748b' }}>
                {isScanning ? '✓' : '+'}
              </div>
            </div>
          );
        })}
      </div>
      
      <div style={{ textAlign: 'center', marginTop: '40px', color: '#475569', fontSize: '0.78rem' }}>
        Stuffy Store &mdash; Omni-channel
      </div>
    </div>
  );
}
