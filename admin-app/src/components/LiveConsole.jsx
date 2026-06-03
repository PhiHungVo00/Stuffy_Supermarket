import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const LiveConsole = ({ apiBase, getToken, products }) => {
  const [shop, setShop] = useState(null);
  const [comments, setComments] = useState([
    { userName: "system_bot", comment: "Broadcast started. Pinned products will be displayed on viewers' screens." }
  ]);
  const [commentText, setCommentText] = useState("");
  const [pinnedProductId, setPinnedProductId] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [likes, setLikes] = useState(0);
  const [gifts, setGifts] = useState([]);

  const socketRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    // Load shop info
    fetch(`${apiBase}/api/shops/mine`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) setShop(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (products && products.length > 0) {
      setPinnedProductId(products[0].id || products[0]._id);
    }
  }, [products]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const startStream = () => {
    if (!shop) return;
    setIsStreaming(true);
    setViewers(120);

    // Sockets connection
    const socket = io(apiBase);
    socketRef.current = socket;

    socket.emit("JOIN_LIVE_STREAM", shop._id);

    socket.on("RECEIVE_STREAM_COMMENT", (msg) => {
      setComments((prev) => [...prev, msg]);
    });

    socket.on("GIFT_RECEIVED", (gift) => {
      setGifts((prev) => [
        {
          id: Date.now(),
          text: `🎁 ${gift.userName} sent you a ${gift.giftType}! (+${Math.floor(gift.giftValue * 0.9)} coins)`
        },
        ...prev
      ]);
      setComments((prev) => [
        ...prev,
        { userName: "system_gift", comment: `🎁 ${gift.userName} sent a ${gift.giftType}!` }
      ]);
    });

    // Simulated likes and viewer count fluctuating
    const statsInterval = setInterval(() => {
      setLikes(prev => prev + Math.floor(Math.random() * 8) + 1);
      setViewers(prev => Math.max(50, prev + Math.floor(Math.random() * 7) - 3));
    }, 4000);

    socketRef.current.statsInterval = statsInterval;
  };

  const stopStream = () => {
    setIsStreaming(false);
    setViewers(0);
    setLikes(0);
    setGifts([]);
    if (socketRef.current) {
      clearInterval(socketRef.current.statsInterval);
      socketRef.current.off("RECEIVE_STREAM_COMMENT");
      socketRef.current.off("GIFT_RECEIVED");
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const handlePinProduct = () => {
    if (!pinnedProductId || !socketRef.current || !shop) return;
    const prod = products.find(p => (p.id || p._id) === pinnedProductId);
    if (prod) {
      socketRef.current.emit("PIN_PRODUCT", {
        shopId: shop._id,
        product: {
          id: prod.id || prod._id,
          name: prod.name,
          price: prod.price,
          image: prod.image
        }
      });
      alert(`Pinned product: ${prod.name} successfully!`);
    }
  };

  const sendComment = (e) => {
    e.preventDefault();
    if (!commentText.trim() || !socketRef.current || !shop) return;

    socketRef.current.emit("SEND_STREAM_COMMENT", {
      shopId: shop._id,
      userName: "Shop Host",
      comment: commentText.trim()
    });

    setCommentText("");
  };

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        clearInterval(socketRef.current.statsInterval);
        socketRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "30px", minHeight: "600px" }}>
      {/* Left Column: Camera Simulation & Stream Controls */}
      <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
        
        {/* Mock Stream View */}
        <div style={{
          position: "relative",
          height: "400px",
          background: isStreaming ? "#1e293b" : "black",
          borderRadius: "20px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          border: "1px solid var(--border-light)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.05)"
        }}>
          {isStreaming ? (
            <>
              {/* Camera Simulation feed */}
              <div style={{ width: "120px", height: "120px", borderRadius: "50%", border: "4px solid #10b981", borderTopColor: "transparent", animation: "spin 2s linear infinite", display: "flex", justifyContent: "center", alignItems: "center" }}>
                <span style={{ fontSize: "3rem" }}>📹</span>
              </div>
              <h3 style={{ color: "white", marginTop: "20px", fontWeight: "900", letterSpacing: "1px" }}>YOU ARE LIVE</h3>
              
              {/* Stats Bar overlay */}
              <div style={{ position: "absolute", top: "20px", left: "20px", display: "flex", gap: "10px", zIndex: 10 }}>
                <span style={{ background: "#ef4444", color: "white", fontSize: "0.75rem", fontWeight: "bold", padding: "4px 10px", borderRadius: "6px" }}>LIVE</span>
                <span style={{ background: "rgba(0,0,0,0.6)", color: "white", fontSize: "0.75rem", padding: "4px 10px", borderRadius: "6px" }}>👤 {viewers} Viewers</span>
                <span style={{ background: "rgba(0,0,0,0.6)", color: "white", fontSize: "0.75rem", padding: "4px 10px", borderRadius: "6px" }}>❤️ {likes} Likes</span>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: "4rem" }}>🎥</span>
              <h3 style={{ color: "#64748b", marginTop: "15px" }}>Stream Offline</h3>
              <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "5px 0 20px 0" }}>Start your broadcast to interact with your customers.</p>
              <button 
                onClick={startStream}
                style={{ padding: "12px 30px", background: "var(--primary-color)", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", fontSize: "0.95rem" }}
              >
                Go Live Now
              </button>
            </>
          )}
        </div>

        {/* Stream Actions Panel */}
        {isStreaming && (
          <div className="ds-glass-card" style={{ padding: "25px", display: "flex", flexDirection: "column", gap: "15px" }}>
            <h4 style={{ margin: "0", color: "var(--text-main)", fontWeight: "800" }}>Broadcast Console</h4>
            
            {/* Pinned Product Selection */}
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.82rem" }}>Pin Product on Screen</label>
                <select 
                  value={pinnedProductId} 
                  onChange={e => setPinnedProductId(e.target.value)} 
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)" }}
                >
                  {products.map(p => (
                    <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={handlePinProduct}
                style={{ padding: "10px 20px", background: "#ea580c", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
              >
                Pin Product
              </button>
            </div>

            <button 
              onClick={stopStream}
              style={{ padding: "10px 20px", background: "#ef4444", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", alignSelf: "flex-start", marginTop: "10px" }}
            >
              Stop Broadcast
            </button>
          </div>
        )}
      </div>

      {/* Right Column: Live Chat & Gifts Ledgers */}
      <div style={{ display: "grid", gridTemplateRows: "1.2fr 1fr", gap: "20px" }}>
        
        {/* Livestream Chat Feed */}
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border-light)", borderRadius: "18px", overflow: "hidden", background: "white", height: "400px" }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-light)", background: "#f8fafc" }}>
            <h4 style={{ margin: 0, fontWeight: "800" }}>Live Comments</h4>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "15px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {comments.map((msg, idx) => (
              <div key={idx} style={{ fontSize: "0.85rem", lineHeight: 1.4 }}>
                <strong style={{ color: msg.userName === "system_bot" ? "#10b981" : msg.userName === "Shop Host" ? "#ea580c" : msg.userName === "system_gift" ? "#ec4899" : "#3b82f6", marginRight: "6px" }}>
                  {msg.userName}:
                </strong>
                <span style={{ color: "var(--text-main)" }}>{msg.comment}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          
          {isStreaming && (
            <form onSubmit={sendComment} style={{ padding: "10px 15px", borderTop: "1px solid var(--border-light)", display: "flex", gap: "8px" }}>
              <input 
                type="text" 
                placeholder="Type reply..." 
                value={commentText} 
                onChange={e => setCommentText(e.target.value)} 
                style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-light)", outline: "none" }}
              />
              <button 
                type="submit" 
                style={{ padding: "8px 14px", borderRadius: "6px", border: "none", background: "#3b82f6", color: "white", fontWeight: "700", cursor: "pointer" }}
              >
                Send
              </button>
            </form>
          )}
        </div>

        {/* Received Gifts Ledger */}
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border-light)", borderRadius: "18px", overflow: "hidden", background: "white" }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-light)", background: "#fdf2f8" }}>
            <h4 style={{ margin: 0, fontWeight: "800", color: "#db2777" }}>Virtual Gifts Ledger 🪙</h4>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "15px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {gifts.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "0.85rem", margin: 0 }}>No gifts received yet during this session.</p>
            ) : (
              gifts.map(gift => (
                <div key={gift.id} style={{
                  padding: "8px 12px",
                  background: "#fff5f5",
                  border: "1px solid #fed7d7",
                  borderRadius: "8px",
                  fontSize: "0.82rem",
                  fontWeight: "700",
                  color: "#991b1b"
                }}>
                  {gift.text}
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LiveConsole;
