import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
// @ts-ignore
import { useI18nStore } from 'store/i18n';

const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.'));
const API_BASE = isLocalhost ? 'http://localhost:5000' : 'https://stuffy-backend-api-xmln.onrender.com';

const playBeepSound = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime); // High pitched beep
    
    gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.15);
  } catch (err) {
    console.warn("AudioContext failed:", err);
  }
};

export default function MobileScanner() {
  const { t } = useI18nStore();
  const { sessionCode } = useParams();
  const [products, setProducts] = useState([]);
  const [scannedId, setScannedId] = useState(null);
  const [socket, setSocket] = useState(null);

  const [currentSession, setCurrentSession] = useState(sessionCode || "");
  const [isLinked, setIsLinked] = useState(!!sessionCode);
  const [inputCode, setInputCode] = useState("");

  const [lastScannedResult, setLastScannedResult] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const scannerRef = useRef(null);

  useEffect(() => {
    // Fetch product catalogue
    fetch(`${API_BASE}/api/products`)
      .then(res => res.json())
      .then(data => setProducts(data.products || (Array.isArray(data) ? data : [])))
      .catch(err => console.error("Error fetching catalogue:", err));
  }, []);

  useEffect(() => {
    if (!currentSession) return;

    // Initialize socket connection
    const socketInstance = io(API_BASE);
    setSocket(socketInstance);
    socketInstance.emit("JOIN_CART_SESSION", currentSession);

    // Load html5-qrcode library from CDN
    if (!window.Html5QrcodeScanner) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
      script.async = true;
      script.onload = () => {
        startScanner();
      };
      document.body.appendChild(script);
    } else {
      startScanner();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("[Scanner] Tab became visible, restarting camera...");
        startScanner();
      } else {
        if (scannerRef.current) {
          scannerRef.current.clear().catch(e => console.warn("Error stopping scanner on hidden:", e));
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      socketInstance.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.warn("Error stopping scanner:", e));
      }
    };
  }, [currentSession]);

  const startScanner = () => {
    if (!window.Html5QrcodeScanner) return;
    
    // Auto-initialize camera scanner
    setTimeout(() => {
      const scanner = new window.Html5QrcodeScanner("reader", {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        rememberLastUsedCamera: true
      });
      
      scannerRef.current = scanner;
      
      scanner.render((decodedText) => {
        handleDecodedText(decodedText);
      }, (err) => {
        // Suppress verbose scanner errors in logs
      });
    }, 300);
  };

  const handleDecodedText = (text) => {
    if (text === lastScannedResult) return; // Prevent double scanning the same QR Code instantly
    
    setLastScannedResult(text);
    setTimeout(() => setLastScannedResult(""), 3000); // Allow scan again after 3s

    playBeepSound();
    if (navigator.vibrate) navigator.vibrate(120);

    // Extract product ID from text (e.g. from link or raw ID)
    let prodId = text;
    if (text.includes("/product/")) {
      const parts = text.split("/product/");
      prodId = parts[parts.length - 1];
    } else if (text.includes("STUFFY-PAYOS-")) {
      setScanMessage("Đây là mã QR thanh toán! Vui lòng quét mã QR sản phẩm.");
      return;
    }

    // Find the product in local database
    const matchingProd = products.find(p => (p.id === prodId || p._id === prodId));
    if (matchingProd) {
      if (socket && currentSession) {
        socket.emit("MOBILE_SCAN_ITEM", { sessionCode: currentSession, product: matchingProd });
        setScanMessage(`Đã quét thành công: ${matchingProd.name}! (Giá: $${matchingProd.price})`);
        setScannedId(matchingProd.id || matchingProd._id);
        setTimeout(() => {
          setScannedId(null);
          setScanMessage("");
        }, 3000);
      }
    } else {
      setScanMessage(`Quét mã thành công nhưng không tìm thấy sản phẩm trong hệ thống! (Mã: ${prodId})`);
      setTimeout(() => setScanMessage(""), 4000);
    }
  };

  const handleLinkSession = (e) => {
    e.preventDefault();
    if (inputCode.trim().length === 4) {
      setCurrentSession(inputCode.trim().toUpperCase());
      setIsLinked(true);
    } else {
      alert("Mã PIN phiên phải có 4 ký tự!");
    }
  };

  if (!isLinked) {
    return (
      <div style={{ maxWidth: '400px', margin: '40px auto', background: '#0f172a', minHeight: '80vh', padding: '30px 24px', color: 'white', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <span style={{ fontSize: '3.5rem' }}>📱</span>
          <h2 style={{ fontSize: '1.5rem', marginTop: '15px', fontWeight: '800', letterSpacing: '-0.5px' }}>Liên Kết Thiết Bị</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginTop: '8px', lineHeight: 1.5 }}>
            Vui lòng xem mã PIN phiên 4 ký tự hiển thị ở góc dưới giỏ hàng máy tính của bạn để liên kết thiết bị.
          </p>
        </div>

        <form onSubmit={handleLinkSession} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '8px' }}>Mã PIN Session</label>
            <input 
              type="text" 
              maxLength={4}
              value={inputCode} 
              onChange={e => setInputCode(e.target.value)} 
              placeholder="Ví dụ: AX2B" 
              style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '1.2rem', textAlign: 'center', letterSpacing: '4px', fontWeight: 'bold', outline: 'none', textTransform: 'uppercase', boxSizing: 'border-box' }}
              required
            />
          </div>

          <button 
            type="submit" 
            style={{ width: '100%', padding: '15px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '800', fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)' }}
          >
            Kết Nối Ngay
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '50px', color: '#475569', fontSize: '0.75rem' }}>
          Stuffy Scan & Go &bull; Local & Cloud
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', background: '#0f172a', minHeight: '100vh', padding: '20px', color: 'white', borderRadius: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', marginTop: '10px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', margin: '0 0 5px 0', fontWeight: '700' }}>Real-time Camera Scanner</h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>{t('session')}: <strong style={{color: '#22c55e', letterSpacing: '2px'}}>{currentSession}</strong></p>
        </div>
        <button 
          onClick={() => { setIsLinked(false); setCurrentSession(""); }}
          style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Hủy Kết Nối
        </button>
      </div>

      {/* Real HTML5 Camera QrCode Scan View */}
      <div style={{ width: '100%', background: 'black', borderRadius: '18px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', position: 'relative', marginBottom: '20px' }}>
        <div id="reader" style={{ width: '100%' }}></div>
      </div>

      {scanMessage && (
        <div style={{ 
          padding: '12px 18px', 
          background: 'rgba(34,197,94,0.15)', 
          color: '#22c55e', 
          border: '1px solid rgba(34,197,94,0.3)', 
          borderRadius: '12px', 
          fontSize: '0.85rem', 
          fontWeight: '700', 
          textAlign: 'center', 
          marginBottom: '20px',
          animation: 'blink 1.5s infinite alternate'
        }}>
          {scanMessage}
        </div>
      )}

      {/* Product Catalog quick-tap reference */}
      <div style={{ marginTop: '20px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px', color: '#cbd5e1' }}>Hoặc chọn nhanh sản phẩm để quét thử (Test):</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {products.map(p => {
            const isScanning = scannedId === (p.id || p._id);
            return (
              <div 
                key={p.id || p._id} 
                onClick={() => handleDecodedText(p.id || p._id)}
                style={{ 
                  background: isScanning ? '#22c55e' : 'rgba(255,255,255,0.05)', 
                  padding: '12px 15px', 
                  borderRadius: '12px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px',
                  transition: 'all 0.2s',
                  transform: isScanning ? 'scale(0.95)' : 'scale(1)',
                  cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
              >
                <img src={p.image} style={{ width: '40px', height: '40px', background: 'white', borderRadius: '6px', objectFit: 'contain' }} />
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 3px 0', fontSize: '0.95rem', color: isScanning ? '#000' : 'white' }}>{p.name}</h4>
                  <p style={{ margin: 0, color: isScanning ? 'rgba(0,0,0,0.6)' : '#a855f7', fontWeight: 'bold', fontSize: '0.85rem' }}>${p.price}</p>
                </div>
                <div style={{ fontSize: '1.1rem', color: isScanning ? '#000' : '#64748b' }}>
                  {isScanning ? '✓' : '+'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <div style={{ textAlign: 'center', marginTop: '40px', color: '#475569', fontSize: '0.78rem' }}>
        Stuffy Store &mdash; Omni-channel
      </div>
    </div>
  );
}