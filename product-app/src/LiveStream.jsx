import React, { useState, useEffect, useRef } from "react";
import { useCartStore } from "store/store";
import { io } from "socket.io-client";
import { getOptimizedImage } from "./utils/image";
// @ts-ignore
import { useI18nStore } from "store/i18n";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';
const DEFAULT_VIDEO = "https://assets.mixkit.co/videos/preview/mixkit-woman-recording-a-video-with-her-smartphone-40810-large.mp4";

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
  const [viewerCount, setViewerCount] = useState(148);

  // New Gifting & Pinning State
  const [pinnedProduct, setPinnedProduct] = useState(null);
  const [giftAnimation, setGiftAnimation] = useState(null);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [userCoins, setUserCoins] = useState(0);

  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const addToCart = useCartStore((state) => state.addToCart);

  // User details
  const [userProfile, setUserProfile] = useState({ name: "Guest" });

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

    socket.emit("JOIN_LIVE_STREAM", shopId);

    socket.on("RECEIVE_STREAM_COMMENT", (msg) => {
      setComments((prev) => [...prev, msg]);
    });

    socket.on("PRODUCT_PINNED", ({ product }) => {
      setPinnedProduct(product);
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

    // Simulated chatbot activity
    const botUserNames = ["lan_anh_hcm", "phong_99", "kyle_smith", "yuki_chan", "hoang_long_vũ", "shop_fan_07", "jenny_rose"];
    const botCommentKeys = [
      "bot_comment_1",
      "bot_comment_2",
      "bot_comment_3",
      "bot_comment_4",
      "bot_comment_5",
      "bot_comment_6",
      "bot_comment_7",
      "bot_comment_8",
      "bot_comment_9"
    ];

    const botInterval = setInterval(() => {
      const randomUser = botUserNames[Math.floor(Math.random() * botUserNames.length)];
      const randomCommentKey = botCommentKeys[Math.floor(Math.random() * botCommentKeys.length)];
      
      // Emit to stream to simulate standard sync comment activity
      socket.emit("SEND_STREAM_COMMENT", {
        shopId,
        userName: randomUser,
        commentKey: randomCommentKey
      });

      // Update viewer count randomly
      setViewerCount(prev => Math.max(80, prev + Math.floor(Math.random() * 9) - 4));
    }, 8000);

    return () => {
      socket.off("RECEIVE_STREAM_COMMENT");
      socket.off("PRODUCT_PINNED");
      socket.off("GIFT_RECEIVED");
      socket.disconnect();
      clearInterval(botInterval);
    };

  }, [shopId]);

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

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>{t('live_stream_loading')}</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: "30px", background: "#0f172a", color: "white", padding: "35px", borderRadius: "24px", minHeight: "650px", overflow: "hidden" }}>
      
      {/* Left Column: Live Streaming Simulation Player */}
      <div style={{ position: "relative", height: "650px", background: "black", borderRadius: "18px", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center" }}>
        
        {/* Real video stream loop */}
        <video 
          src={DEFAULT_VIDEO} 
          autoPlay 
          loop 
          muted 
          playsInline 
          style={{ width: "100%", height: "100%", objectFit: "cover" }} 
        />

        {/* Streaming Info Overlay Header */}
        <div style={{ position: "absolute", top: "20px", left: "20px", right: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", background: "rgba(0,0,0,0.5)", padding: "8px 16px", borderRadius: "99px", backdropFilter: "blur(4px)" }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#ef4444", borderRadius: "50%", animation: "blink 1s infinite alternate" }}></span>
            <span style={{ fontSize: "0.85rem", fontWeight: "800", letterSpacing: "1px" }}>{t('live_label')}</span>
            <span style={{ color: "#cbd5e1", fontSize: "0.8rem" }}>{viewerCount} {t('viewers')}</span>
          </div>

          <div style={{ background: "rgba(0,0,0,0.5)", padding: "8px 16px", borderRadius: "99px", backdropFilter: "blur(4px)", fontSize: "0.82rem", fontWeight: "700" }}>
            {t('host')}: {shop?.name || "Stuffy Shop"}
          </div>
        </div>

        {/* Pinned Product Card */}
        {pinnedProduct && (
          <div style={{ position: "absolute", bottom: "110px", left: "30px", width: "280px", background: "white", padding: "12px", borderRadius: "16px", color: "black", display: "flex", gap: "10px", alignItems: "center", border: "2px solid #ea580c", boxShadow: "0 10px 25px rgba(234, 88, 12, 0.2)", zIndex: 15 }}>
            <img src={pinnedProduct.image} alt="" style={{ width: "45px", height: "45px", objectFit: "contain" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.68rem", fontWeight: "800", color: "#ea580c", textTransform: "uppercase" }}>🔥 {t('pinned_deal')}</div>
              <div style={{ fontSize: "0.8rem", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pinnedProduct.name}</div>
              <div style={{ fontSize: "0.82rem", fontWeight: "800", color: "var(--primary-color)" }}>${pinnedProduct.price}</div>
            </div>
            <button
              onClick={() => {
                addToCart(pinnedProduct);
                window.dispatchEvent(new CustomEvent('STUFFY_TOAST', { detail: { message: t('added_to_cart_toast', { name: pinnedProduct.name }) } }));
              }}
              style={{ background: "#ea580c", color: "white", border: "none", padding: "6px 12px", borderRadius: "8px", fontSize: "0.75rem", fontWeight: "bold", cursor: "pointer" }}
            >
              {t('buy')}
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
            <span>🎉</span>
            <span>{giftAnimation.userName} {t('gift_' + giftAnimation.giftType.toLowerCase() + '_desc')}</span>
            <span style={{ fontSize: "1.5rem" }}>
              {giftAnimation.giftType === "Rose" ? "🌹" : (giftAnimation.giftType === "Heart" ? "💖" : "🚀")}
            </span>
          </div>
        )}

        {/* Shopping bag button overlay */}
        <button 
          onClick={() => setShowDrawer(!showDrawer)}
          style={{ position: "absolute", bottom: "30px", left: "30px", width: "60px", height: "60px", borderRadius: "50%", background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "white", fontSize: "1.8rem", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", boxShadow: "0 10px 15px -3px rgba(234, 88, 12, 0.4)", zIndex: 10 }}
        >
          🛍️
        </button>

        {/* Virtual Gifting Button */}
        <button 
          onClick={() => setShowGiftModal(!showGiftModal)}
          style={{ position: "absolute", bottom: "30px", left: "105px", width: "60px", height: "60px", borderRadius: "50%", background: "linear-gradient(135deg, #ec4899, #db2777)", border: "none", color: "white", fontSize: "1.8rem", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", boxShadow: "0 10px 15px -3px rgba(219, 39, 119, 0.4)", zIndex: 10 }}
        >
          🎁
        </button>

        {/* Gifting Selection Modal */}
        {showGiftModal && (
          <div style={{ position: "absolute", bottom: "100px", left: "105px", width: "240px", background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", borderRadius: "16px", padding: "15px", color: "#0f172a", border: "1px solid rgba(255,255,255,0.2)", zIndex: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px" }}>
              <span style={{ fontWeight: "800", fontSize: "0.85rem" }}>{t('coins')}: {userCoins} 🪙</span>
              <button onClick={() => setShowGiftModal(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontWeight: "bold" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { type: "Rose", cost: 5, emoji: "🌹" },
                { type: "Heart", cost: 10, emoji: "💖" },
                { type: "Rocket", cost: 50, emoji: "🚀" }
              ].map(gift => (
                <button
                  key={gift.type}
                  onClick={() => sendGift(gift.type)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "white", cursor: "pointer", fontWeight: "700", fontSize: "0.82rem", transition: "all 0.15s" }}
                  onMouseOver={e=>e.currentTarget.style.background="#fdf2f8"}
                  onMouseOut={e=>e.currentTarget.style.background="white"}
                >
                  <span style={{ fontSize: "1.2rem", marginRight: "8px" }}>{gift.emoji}</span>
                  <span style={{ flex: 1, textAlign: "left" }}>{gift.type === "Rose" ? t('rose_gift') : gift.type === "Heart" ? t('heart_gift') : t('rocket_gift')}</span>
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
                    <img src={prod.image} style={{ width: "50px", height: "50px", objectFit: "contain", borderRadius: "8px" }} alt="" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prod.name}</p>
                      <span style={{ fontSize: "0.82rem", fontWeight: "800", color: "#ea580c" }}>${prod.price}</span>
                    </div>
                    <button 
                      onClick={() => {
                        addToCart(prod);
                        window.dispatchEvent(new CustomEvent('STUFFY_TOAST', { 
                          detail: { message: t('added_to_cart_toast', { name: prod.name }), type: 'success' } 
                        }));
                      }}
                      style={{ padding: "6px 12px", borderRadius: "6px", background: "#ea580c", color: "white", border: "none", fontSize: "0.75rem", fontWeight: "700", cursor: "pointer" }}
                    >
                      {t('buy')}
                    </button>
                  </div>
                ))
              )}
            </div>
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
