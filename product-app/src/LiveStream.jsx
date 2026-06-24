import React, { useState, useEffect, useRef } from "react";
import { useCartStore } from "store/store";
import { io } from "socket.io-client";
import Hls from "hls.js";
import { getOptimizedImage } from "./utils/image";
// @ts-ignore
import { useI18nStore } from "store/i18n";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';
const DEFAULT_VIDEO = "https://assets.mixkit.co/videos/preview/mixkit-woman-recording-a-video-with-her-smartphone-40810-large.mp4";


const playPingSound = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
    
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.45);
  } catch (err) {
    console.warn("AudioContext failed:", err);
  }
};

export default function LiveStream() {
  const { t } = useI18nStore();
  const [shopId, setShopId] = useState("");
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState([
    { userName: "system_bot", commentKey: "live_welcome" },
    { userName: "shop_assistant", commentKey: "live_welcome_desc" }
  ]);
  const [commentText, setCommentText] = useState("");
  const [showDrawer, setShowDrawer] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);

  // New Gifting & Pinning State
  const [pinnedProduct, setPinnedProduct] = useState(null);
  const [giftAnimation, setGiftAnimation] = useState(null);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [userCoins, setUserCoins] = useState(0);

  // Quick Checkout States
  const [showQuickCheckout, setShowQuickCheckout] = useState(false);
  const [checkoutProduct, setCheckoutProduct] = useState(null);
  const [quickAddress, setQuickAddress] = useState({ address: '123 Stream Rd', city: 'Hồ Chí Minh', postalCode: '70000', country: 'Vietnam' });
  const [quickPaymentMethod, setQuickPaymentMethod] = useState('stripe'); // stripe or vietqr
  const [quickCheckoutLoading, setQuickCheckoutLoading] = useState(false);
  const [payosQrData, setPayosQrData] = useState(null); // { qrCode, orderCode, checkoutUrl, amount }
  const [useDemoHls, setUseDemoHls] = useState(false);

  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const addToCart = useCartStore((state) => state.addToCart);

  // User details
  const [userProfile, setUserProfile] = useState({ name: "Guest" });
  const [sfuFrame, setSfuFrame] = useState(null);
  const [liveTokenData, setLiveTokenData] = useState(null);
  const [isUsingLiveKit, setIsUsingLiveKit] = useState(false);
  const [livekitError, setLivekitError] = useState(null);
  const livekitRoomRef = useRef(null);

  // HLS Player lifecycle
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const streamUrlToPlay = useDemoHls 
      ? "https://test-streams.mux.dev/x36xhg/playlist.m3u8"
      : (shop?.isLive ? shop?.activeStreamUrl : null);

    if (streamUrlToPlay && streamUrlToPlay.includes('.m3u8')) {
      console.log("[HLS Player] Attempting to play HLS stream:", streamUrlToPlay);
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true
        });
        hlsRef.current = hls;
        hls.loadSource(streamUrlToPlay);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(err => console.log("Auto-play blocked:", err));
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error("[HLS Player] Fatal network error, trying to recover...");
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error("[HLS Player] Fatal media error, trying to recover...");
                hls.recoverMediaError();
                break;
              default:
                console.error("[HLS Player] Unrecoverable error, falling back to default video.");
                video.src = DEFAULT_VIDEO;
                video.load();
                video.play().catch(() => {});
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrlToPlay;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(() => {});
        });
      } else {
        console.warn("[HLS Player] HLS not supported. Falling back to default video.");
        video.src = DEFAULT_VIDEO;
        video.load();
        video.play().catch(() => {});
      }
    } else {
      console.log("[HLS Player] Playing fallback MP4 loop video.");
      video.src = DEFAULT_VIDEO;
      video.load();
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [shop?.isLive, shop?.activeStreamUrl, useDemoHls, loading]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("shop");
    if (id) {
      setShopId(id);
    } else {
      // Find first shop as fallback
      fetch(`${API_BASE}/api/shops`)
        .then(res => res.json())
        .then(shops => {
          if (shops && shops.length > 0) {
            setShopId(shops[0]._id);
          }
        });
    }

    const userInfoString = localStorage.getItem("userInfo");
    if (userInfoString) {
      try {
        const info = JSON.parse(userInfoString);
        setUserProfile(info);
        
        fetch(`${API_BASE}/api/auth/me`, {
          headers: { "Authorization": `Bearer ${info.token}` }
        })
        .then(res => res.json())
        .then(data => {
          if (data && data.coinsBalance !== undefined) {
            setUserCoins(data.coinsBalance);
          }
        })
        .catch(() => {});
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (!shopId) return;

    const fetchShopAndProducts = async () => {
      setLoading(true);
      try {
        const shopRes = await fetch(`${API_BASE}/api/shops/${shopId}`);
        const shopData = await shopRes.json();
        if (shopData && !shopData.error) {
          setShop(shopData);
        }

        const prodRes = await fetch(`${API_BASE}/api/products?pageNumber=1&pageSize=10&shop=${shopId}`);
        const prodData = await prodRes.json();
        setProducts(prodData.products || []);

        // Fetch Live token (Host or Viewer)
        let token = null;
        const userInfoString = localStorage.getItem("userInfo");
        if (userInfoString) {
          try {
            const info = JSON.parse(userInfoString);
            token = info.token;
          } catch(e){}
        }
        let tokenHeaders = { 'Content-Type': 'application/json' };
        if (token) {
          tokenHeaders['Authorization'] = `Bearer ${token}`;
        }
        try {
          const tokenRes = await fetch(`${API_BASE}/api/shops/${shopId}/live-token`, {
            method: 'POST',
            headers: tokenHeaders,
            body: JSON.stringify({ role: 'viewer' })
          });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            setLiveTokenData(tokenData);
            console.log("[SFU] Live token response:", tokenData);
          }
        } catch (tokenErr) {
          console.warn("[SFU] Failed to fetch live token, falling back:", tokenErr);
        }
      } catch (err) {
        console.error("Error loading stream data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchShopAndProducts();

    // Sockets connection
    const socket = io(API_BASE);
    socketRef.current = socket;

    socket.emit("JOIN_LIVE_STREAM", { shopId, role: 'viewer' });

    socket.on("RTC_SIGNAL", async ({ senderId, signalData }) => {
      try {
        if (signalData.sdp) {
          console.log("[WebRTC] Received live stream WebRTC offer from host:", senderId);
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          });
          pcRef.current = pc;

          pc.ontrack = (event) => {
            console.log("[WebRTC] Remote WebRTC video track received!");
            if (videoRef.current) {
              videoRef.current.srcObject = event.streams[0];
              videoRef.current.play().catch(e => console.warn("Auto-play WebRTC stream blocked:", e));
            }
          };

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit("RTC_SIGNAL", {
                targetId: senderId,
                signalData: { candidate: event.candidate }
              });
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("RTC_SIGNAL", {
            targetId: senderId,
            signalData: { sdp: pc.localDescription }
          });
        } else if (signalData.candidate) {
          if (pcRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(signalData.candidate));
          }
        }
      } catch (err) {
        console.error("[WebRTC] Error handling RTC_SIGNAL on client:", err);
      }
    });

    socket.on("RECEIVE_STREAM_COMMENT", (msg) => {
      setComments((prev) => [...prev, msg]);
    });

    socket.on("PRODUCT_PINNED", ({ product }) => {
      setPinnedProduct(product);
      if (product) {
        playPingSound();
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      }
    });

    socket.on("GIFT_RECEIVED", ({ userName, giftType, giftValue }) => {
      setComments((prev) => [...prev, {
        userName: "system_gift",
        giftType,
        giftSender: userName
      }]);
      setGiftAnimation({ userName, giftType });
      setTimeout(() => setGiftAnimation(null), 4000);
    });

    socket.on("LIVESTREAM_STATUS_UPDATE", ({ isLive, activeStreamUrl }) => {
      console.log("[Socket.io] Livestream status updated:", isLive, activeStreamUrl);
      setShop(prev => prev ? { ...prev, isLive, activeStreamUrl } : null);
      if (!isLive) {
        setSfuFrame(null);
      }
    });

    socket.on("VIEWER_STREAM_FRAME", (frame) => {
      setSfuFrame(frame);
    });

    socket.on("LIVESTREAM_VIEWER_COUNT", ({ count }) => {
      setViewerCount(count);
    });

    

    return () => {
      socket.off("RECEIVE_STREAM_COMMENT");
      socket.off("PRODUCT_PINNED");
      socket.off("GIFT_RECEIVED");
      socket.off("LIVESTREAM_STATUS_UPDATE");
      socket.off("VIEWER_STREAM_FRAME");
      socket.off("LIVESTREAM_VIEWER_COUNT");
      socket.disconnect();
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };

  }, [shopId]);

  // LiveKit Connection lifecycle
  useEffect(() => {
    if (!liveTokenData || liveTokenData.useLocalSfu) {
      return;
    }

    let active = true;
    const connectLiveKit = async () => {
      try {
        console.log("[LiveKit] Loading LiveKit client from CDN...");
        if (!window.LiveKit) {
          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js";
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error("Failed to load LiveKit client from CDN"));
            document.head.appendChild(script);
          });
        }

        if (!active) return;
        console.log("[LiveKit] LiveKit loaded. Connecting to room:", liveTokenData.roomName);
        
        const { Room, RoomEvent } = window.LiveKit;
        const room = new Room();
        livekitRoomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          console.log("[LiveKit] Track subscribed:", track.kind);
          if (track.kind === "video" && videoRef.current) {
            track.attach(videoRef.current);
            setIsUsingLiveKit(true);
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          console.log("[LiveKit] Track unsubscribed");
          if (track.kind === "video" && videoRef.current) {
            track.detach(videoRef.current);
            setIsUsingLiveKit(false);
          }
        });

        await room.connect(liveTokenData.url, liveTokenData.token);
        console.log("[LiveKit] Connected to room successfully!");

        for (const participant of room.participants.values()) {
          for (const pub of participant.videoTracks.values()) {
            if (pub.isSubscribed && pub.track && videoRef.current) {
              pub.track.attach(videoRef.current);
              setIsUsingLiveKit(true);
            }
          }
        }
      } catch (err) {
        console.error("[LiveKit] Error connecting to LiveKit room:", err);
        setLivekitError(err.message);
        setIsUsingLiveKit(false);
      }
    };

    connectLiveKit();

    return () => {
      active = false;
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
      }
      setIsUsingLiveKit(false);
    };
  }, [liveTokenData]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const sendComment = (e) => {
    e.preventDefault();
    if (!commentText.trim() || !socketRef.current) return;

    socketRef.current.emit("SEND_STREAM_COMMENT", {
      shopId,
      userName: userProfile.name || "Guest",
      comment: commentText.trim()
    });

    setCommentText("");
  };

  const sendGift = (giftType) => {
    const giftRates = { Rose: 5, Heart: 10, Rocket: 50 };
    const cost = giftRates[giftType] || 5;

    if (userCoins < cost) {
      alert(t('insufficient_coins'));
      return;
    }

    if (socketRef.current && userProfile && (userProfile._id || userProfile.id)) {
      socketRef.current.emit("SEND_VIRTUAL_GIFT", {
        shopId,
        senderId: userProfile._id || userProfile.id,
        giftType
      });
      setUserCoins(prev => Math.max(0, prev - cost));
      setShowGiftModal(false);
    } else {
      alert(t('login_to_gift'));
    }
  };

  const handleQuickCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!userProfile || !userProfile.token) {
      alert(t('login_required') || 'Vui lòng đăng nhập để mua hàng!');
      return;
    }
    setQuickCheckoutLoading(true);
    
    // Construct order items
    const orderItems = [{
      name: checkoutProduct.name,
      qty: 1,
      image: checkoutProduct.image,
      price: checkoutProduct.price,
      product: checkoutProduct._id || checkoutProduct.id
    }];

    const orderPayload = {
      orderItems,
      itemsPrice: checkoutProduct.price,
      taxPrice: 0,
      totalPrice: checkoutProduct.price + 10, // includes $10 shipping
      paymentMethod: quickPaymentMethod === 'stripe' ? 'Credit Card (Stripe Mock)' : 'VietQR',
      shippingAddress: quickAddress,
      selectedCarriers: { [shopId]: 'ghn' }
    };

    try {
      // 1. Create order
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userProfile.token}`
        },
        body: JSON.stringify(orderPayload)
      });
      const orderData = await res.json();
      if (!res.ok) {
        throw new Error(orderData.error || 'Failed to place order');
      }

      // 2. Process payment
      if (quickPaymentMethod === 'stripe') {
        // Stripe payment intent mock
        const stripeRes = await fetch(`${API_BASE}/api/payments/pay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-idempotency-key': 'quick_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
          },
          body: JSON.stringify({ amount: checkoutProduct.price + 10 })
        });
        if (!stripeRes.ok) {
          const stripeData = await stripeRes.json();
          throw new Error(stripeData.error || 'Payment failed');
        }
        
        alert('Đặt hàng và thanh toán thành công qua thẻ tín dụng!');
        if (socketRef.current) {
          socketRef.current.emit("LIVE_ORDER_PLACED", {
            shopId,
            amount: checkoutProduct.price,
            productName: checkoutProduct.name,
            productId: checkoutProduct._id || checkoutProduct.id
          });
          socketRef.current.emit("SEND_STREAM_COMMENT", {
            shopId,
            userName: "system_bot",
            comment: `Chúc mừng ${userProfile.name || 'khách hàng'} đã chốt đơn thành công sản phẩm "${checkoutProduct.name}" trên Livestream! [Thành công]`
          });
        }
        setShowQuickCheckout(false);
      } else {
        // VietQR PayOS payment
        const payosRes = await fetch(`${API_BASE}/api/payments/payos/create-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userProfile.token}`
          },
          body: JSON.stringify({
            parentOrderId: orderData.parentOrderId,
            originHost: window.location.origin
          })
        });
        const payosData = await payosRes.json();
        if (payosRes.ok && (payosData.qrCode || payosData.checkoutUrl)) {
          setPayosQrData({
            qrCode: payosData.qrCode || `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=STUFFY-PAYOS-${payosData.orderCode}`,
            orderCode: payosData.orderCode,
            checkoutUrl: payosData.checkoutUrl,
            amount: (checkoutProduct.price + 10) * 25000 // Convert to VND
          });
        } else {
          throw new Error(payosData.error || 'Failed to generate payment QR code');
        }
      }
    } catch (err) {
      alert('Lỗi đặt hàng nhanh: ' + err.message);
    } finally {
      setQuickCheckoutLoading(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>{t('live_stream_loading')}</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: "30px", background: "#0f172a", color: "white", padding: "35px", borderRadius: "24px", minHeight: "650px", overflow: "hidden" }}>
      
      {/* Left Column: Live Streaming Simulation Player */}
      <div style={{ position: "relative", height: "650px", background: "black", borderRadius: "18px", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center" }}>
        
        {/* Local SFU Stream Frame */}
        {sfuFrame && !useDemoHls && !isUsingLiveKit ? (
          <img 
            src={sfuFrame} 
            alt="Live Stream" 
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", top: 0, left: 0, zIndex: 2 }} 
          />
        ) : null}

        {/* Real video stream loop */}
        <video 
          ref={videoRef}
          autoPlay 
          loop 
          muted 
          playsInline 
          style={{ 
            width: "100%", 
            height: "100%", 
            objectFit: "cover",
            display: (sfuFrame && !useDemoHls && !isUsingLiveKit) ? "none" : "block" 
          }} 
        />

        {/* Streaming Info Overlay Header */}
        <div style={{ position: "absolute", top: "20px", left: "20px", right: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", background: "rgba(0,0,0,0.5)", padding: "8px 16px", borderRadius: "99px", backdropFilter: "blur(4px)" }}>
              <span style={{ display: "inline-block", width: "8px", height: "8px", background: shop?.isLive || useDemoHls ? "#ef4444" : "#64748b", borderRadius: "50%", animation: (shop?.isLive || useDemoHls) ? "blink 1s infinite alternate" : "none" }}></span>
              <span style={{ fontSize: "0.85rem", fontWeight: "800", letterSpacing: "1px" }}>{(shop?.isLive || useDemoHls) ? t('live_label') : 'OFFLINE'}</span>
              <span style={{ color: "#cbd5e1", fontSize: "0.8rem" }}>{viewerCount} {t('viewers')}</span>
            </div>
            
            <button
              onClick={() => setUseDemoHls(prev => !prev)}
              style={{ background: useDemoHls ? "#ef4444" : "rgba(0,0,0,0.5)", color: "white", border: "1px solid rgba(255,255,255,0.3)", padding: "8px 16px", borderRadius: "99px", fontSize: "0.78rem", fontWeight: "800", cursor: "pointer", backdropFilter: "blur(4px)", transition: "all 0.2s" }}
            >
              {useDemoHls ? "Dừng HLS Demo" : "Bật HLS Demo"}
            </button>
          </div>

          <div style={{ background: "rgba(0,0,0,0.5)", padding: "8px 16px", borderRadius: "99px", backdropFilter: "blur(4px)", fontSize: "0.82rem", fontWeight: "700" }}>
            {t('host')}: {shop?.name || "Stuffy Shop"}
          </div>
        </div>

        {/* Pinned Product Card */}
        {pinnedProduct && (
          <div style={{ position: "absolute", bottom: "110px", left: "30px", width: "280px", background: "white", padding: "12px", borderRadius: "16px", color: "black", display: "flex", gap: "10px", alignItems: "center", border: "2px solid #ea580c", boxShadow: "0 10px 25px rgba(234, 88, 12, 0.2)", zIndex: 15 }}>
            <img src={pinnedProduct.image} alt={pinnedProduct.name} decoding="async" style={{ width: "45px", height: "45px", objectFit: "contain" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.68rem", fontWeight: "800", color: "#ea580c", textTransform: "uppercase" }}>[HOT] {t('pinned_deal')}</div>
              <div style={{ fontSize: "0.8rem", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pinnedProduct.name}</div>
              <div style={{ fontSize: "0.82rem", fontWeight: "800", color: "var(--primary-color)" }}>${pinnedProduct.price}</div>
            </div>
            <button
              onClick={() => {
                setCheckoutProduct(pinnedProduct);
                setShowQuickCheckout(true);
              }}
              style={{ background: "#ea580c", color: "white", border: "none", padding: "6px 12px", borderRadius: "8px", fontSize: "0.75rem", fontWeight: "bold", cursor: "pointer" }}
            >
              Mua ngay
            </button>
          </div>
        )}

        {/* Flying Gift Animation Alert */}
        {giftAnimation && (
          <div style={{
            position: "absolute",
            top: "40%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "linear-gradient(135deg, rgba(219,39,119,0.9) 0%, rgba(139,92,246,0.9) 100%)",
            padding: "15px 30px",
            borderRadius: "50px",
            color: "white",
            fontWeight: "900",
            fontSize: "1.2rem",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
            zIndex: 30
          }}>
            <span>[Gift]</span>
            <span>{giftAnimation.userName} {t('gift_' + giftAnimation.giftType.toLowerCase() + '_desc')}</span>
            <span style={{ fontSize: "1.5rem" }}>
              {giftAnimation.giftType === "Rose" ? "[Rose]" : (giftAnimation.giftType === "Heart" ? "[Heart]" : "[Rocket]")}
            </span>
          </div>
        )}

        {/* Shopping bag button overlay */}
        <button 
          onClick={() => setShowDrawer(!showDrawer)}
          style={{ position: "absolute", bottom: "30px", left: "30px", width: "60px", height: "60px", borderRadius: "50%", background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "white", fontSize: "1.8rem", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", boxShadow: "0 10px 15px -3px rgba(234, 88, 12, 0.4)", zIndex: 10 }}
        >
          Túi hàng
        </button>

        {/* Virtual Gifting Button */}
        <button 
          onClick={() => setShowGiftModal(!showGiftModal)}
          style={{ position: "absolute", bottom: "30px", left: "105px", width: "60px", height: "60px", borderRadius: "50%", background: "linear-gradient(135deg, #ec4899, #db2777)", border: "none", color: "white", fontSize: "1.8rem", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", boxShadow: "0 10px 15px -3px rgba(219, 39, 119, 0.4)", zIndex: 10 }}
        >
          Tặng quà
        </button>

        {/* Gifting Selection Modal */}
        {showGiftModal && (
          <div style={{ position: "absolute", bottom: "100px", left: "105px", width: "240px", background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", borderRadius: "16px", padding: "15px", color: "#0f172a", border: "1px solid rgba(255,255,255,0.2)", zIndex: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px" }}>
              <span style={{ fontWeight: "800", fontSize: "0.85rem" }}>{t('coins')}: {userCoins} Coins</span>
              <button onClick={() => setShowGiftModal(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontWeight: "bold" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { type: "Rose", cost: 5, emoji: "[Rose]" },
                { type: "Heart", cost: 10, emoji: "[Heart]" },
                { type: "Rocket", cost: 50, emoji: "[Rocket]" }
              ].map(gift => (
                <button
                  key={gift.type}
                  onClick={() => sendGift(gift.type)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "white", cursor: "pointer", fontWeight: "700", fontSize: "0.82rem", transition: "all 0.15s" }}
                  onMouseOver={e=>e.currentTarget.style.background="#fdf2f8"}
                  onMouseOut={e=>e.currentTarget.style.background="white"}
                >
                  <span style={{ fontSize: "1.2rem", marginRight: "8px" }}>{gift.emoji}</span>
                  <span style={{ flex: 1, textAlignment: "left" }}>{gift.type === "Rose" ? t('rose_gift') : gift.type === "Heart" ? t('heart_gift') : t('rocket_gift')}</span>
                  <span style={{ color: "#db2777" }}>{gift.cost} {t('coins')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Shopping Drawer Overlay */}
        {showDrawer && (
          <div style={{ position: "absolute", bottom: "100px", left: "30px", width: "320px", background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", borderRadius: "16px", padding: "15px", color: "#0f172a", border: "1px solid rgba(255,255,255,0.2)", maxHeight: "350px", overflowY: "auto", zIndex: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
              <span style={{ fontWeight: "800", fontSize: "0.95rem" }}>{t('live_bag_title')}</span>
              <button onClick={() => setShowDrawer(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontWeight: "bold" }}>×</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {products.length === 0 ? (
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{t('no_live_products')}</div>
              ) : (
                products.map(prod => (
                  <div key={prod._id || prod.id} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "8px", borderBottom: "1px solid #f1f5f9" }}>
                    <img src={prod.image} style={{ width: "50px", height: "50px", objectFit: "contain", borderRadius: "8px" }} alt={prod.name} decoding="async" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prod.name}</p>
                      <span style={{ fontSize: "0.82rem", fontWeight: "800", color: "#ea580c" }}>${prod.price}</span>
                    </div>
                    <button 
                      onClick={() => {
                        setCheckoutProduct(prod);
                        setShowQuickCheckout(true);
                        setShowDrawer(false);
                      }}
                      style={{ padding: "6px 12px", borderRadius: "6px", background: "#ea580c", color: "white", border: "none", fontSize: "0.75rem", fontWeight: "700", cursor: "pointer" }}
                    >
                      Mua ngay
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Quick Checkout Modal */}
        {showQuickCheckout && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "320px", background: "white", padding: "20px", borderRadius: "16px", color: "#0f172a", zIndex: 25, boxShadow: "0 15px 30px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px", marginBottom: "15px" }}>
              <span style={{ fontWeight: "800", fontSize: "0.95rem" }}>Mua nhanh trực tiếp</span>
              <button onClick={() => { setShowQuickCheckout(false); setPayosQrData(null); }} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontWeight: "bold", fontSize: "1.2rem" }}>×</button>
            </div>

            {!payosQrData ? (
              <form onSubmit={handleQuickCheckoutSubmit}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px", background: "#f8fafc", padding: "8px", borderRadius: "8px" }}>
                  <img src={checkoutProduct.image} style={{ width: "40px", height: "40px", objectFit: "contain" }} alt={checkoutProduct.name} decoding="async" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{checkoutProduct.name}</div>
                    <div style={{ fontSize: "0.8rem", fontWeight: "800", color: "#ea580c" }}>${checkoutProduct.price}</div>
                  </div>
                </div>

                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", color: "#64748b", marginBottom: "4px" }}>Địa chỉ giao hàng</label>
                <input 
                  type="text" 
                  value={quickAddress.address} 
                  onChange={e => setQuickAddress({...quickAddress, address: e.target.value})} 
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.8rem", marginBottom: "10px", outline: "none", boxSizing: "border-box" }}
                  required
                />
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                  <input 
                    type="text" 
                    placeholder="Tỉnh/TP" 
                    value={quickAddress.city} 
                    onChange={e => setQuickAddress({...quickAddress, city: e.target.value})} 
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.8rem", outline: "none", boxSizing: "border-box" }}
                    required
                  />
                  <input 
                    type="text" 
                    placeholder="Quốc gia" 
                    value={quickAddress.country} 
                    onChange={e => setQuickAddress({...quickAddress, country: e.target.value})} 
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.8rem", outline: "none", boxSizing: "border-box" }}
                    required
                  />
                </div>

                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", color: "#64748b", marginBottom: "4px" }}>Thanh toán</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "4px", marginBottom: "15px" }}>
                  <button 
                    type="button"
                    onClick={() => setQuickPaymentMethod('stripe')}
                    style={{ padding: "8px", fontSize: "0.78rem", fontWeight: "700", borderRadius: "8px", border: "2px solid", borderColor: quickPaymentMethod === 'stripe' ? 'var(--primary-color)' : '#e2e8f0', background: quickPaymentMethod === 'stripe' ? 'rgba(99,102,241,0.05)' : 'white', cursor: "pointer" }}
                  >
                    💳 Thẻ tín dụng
                  </button>
                  <button 
                    type="button"
                    onClick={() => setQuickPaymentMethod('vietqr')}
                    style={{ padding: "8px", fontSize: "0.78rem", fontWeight: "700", borderRadius: "8px", border: "2px solid", borderColor: quickPaymentMethod === 'vietqr' ? 'var(--primary-color)' : '#e2e8f0', background: quickPaymentMethod === 'vietqr' ? 'rgba(99,102,241,0.05)' : 'white', cursor: "pointer" }}
                  >
                    📱 VietQR
                  </button>
                </div>

                <button 
                  type="submit" 
                  disabled={quickCheckoutLoading}
                  style={{ width: "100%", padding: "10px", background: "var(--primary-color)", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "0.85rem", cursor: "pointer" }}
                >
                  {quickCheckoutLoading ? 'Đang xử lý...' : `Thanh toán $${checkoutProduct.price + 10}`}
                </button>
              </form>
            ) : (
              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <p style={{ fontSize: "0.78rem", color: "#16a34a", fontWeight: "700", margin: "0 0 10px 0" }}>Quét mã dưới đây để thanh toán tức thì!</p>
                <div style={{ width: "160px", height: "160px", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "8px", background: "white" }}>
                  <img src={payosQrData.qrCode} style={{ width: "100%", height: "100%" }} alt="PayOS VietQR Code" decoding="async" />
                </div>
                <div style={{ fontSize: "0.82rem", fontWeight: "800", color: "#10b981", margin: "10px 0" }}>{payosQrData.amount.toLocaleString('vi-VN')} VND</div>
                
                <button
                  onClick={async () => {
                    // Simulate webhook callback to complete order
                    try {
                      const webhRes = await fetch(`${API_BASE}/api/payments/payos/webhook`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          success: true,
                          data: {
                            orderCode: payosQrData.orderCode,
                            amount: payosQrData.amount,
                            desc: 'success'
                          }
                        })
                      });
                      if (webhRes.ok) {
                        alert('Xác nhận thanh toán thành công! Trình xem Live sẽ tiếp tục.');
                        if (socketRef.current) {
                          socketRef.current.emit("LIVE_ORDER_PLACED", {
                            shopId,
                            amount: checkoutProduct.price,
                            productName: checkoutProduct.name,
                            productId: checkoutProduct._id || checkoutProduct.id
                          });
                          socketRef.current.emit("SEND_STREAM_COMMENT", {
                            shopId,
                            userName: "system_bot",
                            comment: `Chúc mừng ${userProfile.name || 'khách hàng'} đã chốt đơn thành công sản phẩm "${checkoutProduct.name}" trên Livestream! 🔥`
                          });
                        }
                        setShowQuickCheckout(false);
                        setPayosQrData(null);
                      } else {
                        alert('Không thể xác nhận giao dịch.');
                      }
                    } catch (e) {
                      alert('Lỗi kết nối: ' + e.message);
                    }
                  }}
                  style={{ width: "100%", padding: "8px", background: "#10b981", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "0.8rem", cursor: "pointer", marginTop: "10px" }}
                >
                  Xác nhận chuyển khoản thành công
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Right Column: Live Stream Chat box */}
      <div style={{ display: "flex", flexDirection: "column", height: "650px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "18px", overflow: "hidden", background: "rgba(255,255,255,0.02)" }}>
        
        {/* Chat box header */}
        <div style={{ padding: "15px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}>
          <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "800" }}>{t('live_comments_title')}</h4>
        </div>

        {/* Comments Feed */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {comments.map((msg, idx) => (
            <div key={idx} style={{ fontSize: "0.88rem", lineHeight: 1.4 }}>
              {msg.userName === "system_gift" ? (
                <span style={{ color: "#db2777" }}>
                  🎁 <strong>{msg.giftSender}</strong> {t('gift_' + msg.giftType.toLowerCase() + '_desc')}
                </span>
              ) : (
                <>
                  <strong style={{ color: msg.userName === "system_bot" ? "#10b981" : msg.userName === "shop_assistant" ? "#ea580c" : "#60a5fa", marginRight: "8px" }}>
                    {msg.userName}:
                  </strong>
                  <span style={{ color: "#e2e8f0" }}>
                    {msg.commentKey ? t(msg.commentKey) : msg.comment}
                  </span>
                </>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input box */}
        <form onSubmit={sendComment} style={{ padding: "15px 20px", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", gap: "10px" }}>
          <input 
            type="text" 
            placeholder={t('type_comment')}
            value={commentText} 
            onChange={e => setCommentText(e.target.value)} 
            style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "white", outline: "none" }}
          />
          <button 
            type="submit" 
            style={{ padding: "10px 16px", borderRadius: "8px", border: "none", background: "#3b82f6", color: "white", fontWeight: "700", cursor: "pointer" }}
          >
            {t('send_comment')}
          </button>
        </form>

      </div>

      <style>{`@keyframes blink { 0% { opacity: 0.4; } 100% { opacity: 1; } }`}</style>
    </div>
  );
}



