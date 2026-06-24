import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

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
  const [streamUrl, setStreamUrl] = useState("");

  const [activeTab, setActiveTab] = useState("chat");
  const [revenue, setRevenue] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);
  const [maxViewers, setMaxViewers] = useState(0);
  const [viewerHistory, setViewerHistory] = useState([]);
  const [topProducts, setTopProducts] = useState({});

  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const localVideoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const peersRef = useRef({});
  const [hasWebcam, setHasWebcam] = useState(false);

  useEffect(() => {
    // Load shop info
    fetch(`${apiBase}/api/shops/mine`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          setShop(data);
          setStreamUrl(data.activeStreamUrl || "https://test-streams.mux.dev/x36xhg/playlist.m3u8");
          setIsStreaming(data.isLive || false);
        }
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

  const startStream = async () => {
    if (!shop) return;
    
    try {
      const res = await fetch(`${apiBase}/api/shops/mine/livestream`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getToken()}`
        },
        body: JSON.stringify({ isLive: true, activeStreamUrl: streamUrl })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start stream");
      }
      const updatedShop = await res.json();
      setShop(updatedShop);
    } catch (err) {
      alert("Lỗi bắt đầu stream: " + err.message);
      return;
    }

    setIsStreaming(true);
    setViewers(120);

    // Fetch SFU Live Token
    let useLocalSfu = true;
    try {
      const tokenRes = await fetch(`${apiBase}/api/shops/${shop._id}/live-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ role: 'host' })
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.ok ? await tokenRes.json() : {};
        useLocalSfu = tokenData.useLocalSfu !== false;
        console.log("[SFU] Live stream room token retrieved. Local SFU mode:", useLocalSfu);
      }
    } catch (err) {
      console.warn("[SFU] Error getting token, falling back to Local SFU WebSocket mode:", err);
    }

    // Webcam capture integration
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      mediaStreamRef.current = stream;
      setHasWebcam(true);
      setTimeout(() => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }, 200);
    } catch (mediaErr) {
      console.warn("Could not access camera device, falling back to simulator:", mediaErr);
      setHasWebcam(false);
    }

    // Sockets connection
    const socket = io(apiBase);
    socketRef.current = socket;

    socket.emit("JOIN_LIVE_STREAM", { shopId: shop._id, role: 'host' });

    // Local SFU: Host uploads exactly 1 frame stream to server (O(1) Upload bandwidth)
    if (useLocalSfu) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const interval = setInterval(() => {
        if (localVideoRef.current && mediaStreamRef.current) {
          canvas.width = 320;
          canvas.height = 240;
          ctx.drawImage(localVideoRef.current, 0, 0, canvas.width, canvas.height);
          const frameData = canvas.toDataURL('image/jpeg', 0.5);
          socket.emit('HOST_STREAM_FRAME', { shopId: shop._id, frame: frameData });
        }
      }, 90);
      socket.sfuInterval = interval;
      console.log("[SFU] Started O(1) local frame publisher.");
    }

    // Handle Viewer WebRTC connection requests
    socket.on("VIEWER_JOINED", async ({ viewerId }) => {
      console.log(`[WebRTC] Viewer joined: ${viewerId}. Initiating PeerConnection...`);
      
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      peersRef.current[viewerId] = pc;

      // Add local stream tracks to connection
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, mediaStreamRef.current);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("RTC_SIGNAL", {
            targetId: viewerId,
            signalData: { candidate: event.candidate }
          });
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("RTC_SIGNAL", {
          targetId: viewerId,
          signalData: { sdp: pc.localDescription }
        });
      } catch (err) {
        console.error("[WebRTC] Error creating offer:", err);
      }
    });

    socket.on("RTC_SIGNAL", async ({ senderId, signalData }) => {
      const pc = peersRef.current[senderId];
      if (!pc) return;

      try {
        if (signalData.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        } else if (signalData.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        }
      } catch (err) {
        console.error("[WebRTC] Error handling RTC_SIGNAL from sender:", senderId, err);
      }
    });

    socket.on("RECEIVE_STREAM_COMMENT", (msg) => {
      setComments((prev) => [...prev, msg]);
    });

    socket.on("LIVESTREAM_VIEWER_COUNT", ({ count }) => {
      setViewers(count);
      setMaxViewers(prev => Math.max(prev, count));
    });

    socket.on("LIVE_ORDER_RECORDED", ({ amount, productName, productId }) => {
      setOrdersCount(prev => prev + 1);
      setRevenue(prev => prev + amount);
      setTopProducts(prev => {
        const existing = prev[productId] || { name: productName, count: 0, price: amount };
        return {
          ...prev,
          [productId]: {
            ...existing,
            count: existing.count + 1
          }
        };
      });
      setComments(prev => [...prev, {
        userName: "system_bot",
comment: `[Đơn hàng mới] Khách hàng vừa chốt thành công "${productName}" trị giá $${amount}!`
      }]);
    });

    socket.on("GIFT_RECEIVED", (gift) => {
      setGifts((prev) => [
        {
          id: Date.now(),
text: `[Gift] ${gift.userName} sent you a ${gift.giftType}! (+${Math.floor(gift.giftValue * 0.9)} coins)`
        },
        ...prev
      ]);
      setComments((prev) => [
        ...prev,
{ userName: "system_gift", comment: `[Gift] ${gift.userName} sent a ${gift.giftType}!` }
      ]);
    });

    // Simulated likes fluctuating
    const statsInterval = setInterval(() => {
      setLikes(prev => prev + Math.floor(Math.random() * 8) + 1);
    }, 4000);

    socketRef.current.statsInterval = statsInterval;
  };

  const stopStream = async () => {
    try {
      const res = await fetch(`${apiBase}/api/shops/mine/livestream`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getToken()}`
        },
        body: JSON.stringify({ isLive: false, activeStreamUrl: "" })
      });
      if (res.ok) {
        const updatedShop = await res.json();
        setShop(updatedShop);
      }
    } catch (err) {
      console.error("Error stopping stream on backend:", err);
    }

    // Stop webcam
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setHasWebcam(false);

    // Close all viewer connections
    Object.keys(peersRef.current).forEach(viewerId => {
      peersRef.current[viewerId].close();
    });
    peersRef.current = {};

    setIsStreaming(false);
    setViewers(0);
    setLikes(0);
    setGifts([]);
    setRevenue(0);
    setOrdersCount(0);
    setMaxViewers(0);
    setViewerHistory([]);
    setTopProducts({});
    if (socketRef.current) {
      if (socketRef.current.sfuInterval) {
        clearInterval(socketRef.current.sfuInterval);
        console.log("[SFU] Stopped local frame publisher.");
      }
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
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      Object.keys(peersRef.current).forEach(viewerId => {
        peersRef.current[viewerId].close();
      });
      peersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!isStreaming) {
      setViewerHistory([]);
      return;
    }
    const historyInterval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setViewerHistory(prev => {
        const next = [...prev, { time: timeStr, count: viewers }];
        if (next.length > 12) {
          next.shift();
        }
        return next;
      });
    }, 5000);
    return () => clearInterval(historyInterval);
  }, [isStreaming, viewers]);

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
              {/* Webcam feed or Camera Simulation fallback */}
              {hasWebcam ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", top: 0, left: 0, zIndex: 1 }}
                />
              ) : (
                <div style={{ width: "120px", height: "120px", borderRadius: "50%", border: "4px solid #10b981", borderTopColor: "transparent", animation: "spin 2s linear infinite", display: "flex", justifyContent: "center", alignItems: "center" }}>
<span style={{ fontSize: "3rem" }}>[Camera]</span>
                </div>
              )}
              
              <h3 style={{ color: "white", marginTop: "20px", fontWeight: "900", letterSpacing: "1px", zIndex: 2, background: "rgba(0,0,0,0.4)", padding: "4px 12px", borderRadius: "8px" }}>
                {hasWebcam ? "YOU ARE LIVE (WEBCAM)" : "YOU ARE LIVE (SIMULATOR)"}
              </h3>
              
              {/* Stats Bar overlay */}
              <div style={{ position: "absolute", top: "20px", left: "20px", display: "flex", gap: "10px", zIndex: 10 }}>
                <span style={{ background: "#ef4444", color: "white", fontSize: "0.75rem", fontWeight: "bold", padding: "4px 10px", borderRadius: "6px" }}>LIVE</span>
<span style={{ background: "rgba(0,0,0,0.6)", color: "white", fontSize: "0.75rem", padding: "4px 10px", borderRadius: "6px" }}>[User] {viewers} Viewers</span>
<span style={{ background: "rgba(0,0,0,0.6)", color: "white", fontSize: "0.75rem", padding: "4px 10px", borderRadius: "6px" }}>[Like] {likes} Likes</span>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px", width: "100%", boxSizing: "border-box" }}>
<span style={{ fontSize: "3rem" }}>[Live]</span>
              <h3 style={{ color: "#64748b", marginTop: "10px" }}>Stream Offline</h3>
              <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "5px 0 10px 0" }}>Start your broadcast to interact with your customers.</p>
              
              <div style={{ width: "100%", maxWidth: "320px", marginTop: "5px", marginBottom: "15px" }}>
                <label style={{ display: "block", color: "#64748b", fontSize: "0.78rem", fontWeight: "600", marginBottom: "6px", textAlign: "left" }}>HLS Stream URL (.m3u8)</label>
                <input 
                  type="text" 
                  value={streamUrl} 
                  onChange={e => setStreamUrl(e.target.value)} 
                  placeholder="https://example.com/stream.m3u8"
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", fontSize: "0.82rem", outline: "none", boxSizing: "border-box", color: "white", background: "#1e293b" }}
                />
              </div>

              <button 
                onClick={startStream}
                style={{ padding: "12px 30px", background: "var(--primary-color)", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", fontSize: "0.95rem" }}
              >
                Go Live Now
              </button>
            </div>
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

      {/* Right Column: Live Chat, Gifts & Analytics Tabs */}
      <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border-light)", borderRadius: "18px", overflow: "hidden", background: "white", height: "600px" }}>
        
        {/* Tab Navigation */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border-light)", background: "#f8fafc" }}>
          <button 
            onClick={() => setActiveTab("chat")}
            style={{ 
              flex: 1, 
              padding: "12px", 
              border: "none", 
              background: activeTab === "chat" ? "white" : "transparent", 
              borderBottom: activeTab === "chat" ? "2px solid #3b82f6" : "none",
              fontWeight: activeTab === "chat" ? "800" : "600",
              color: activeTab === "chat" ? "#3b82f6" : "#64748b",
              cursor: "pointer",
              fontSize: "0.82rem"
            }}
          >
[Chat] Trò chuyện
          </button>
          <button 
            onClick={() => setActiveTab("gifts")}
            style={{ 
              flex: 1, 
              padding: "12px", 
              border: "none", 
              background: activeTab === "gifts" ? "white" : "transparent", 
              borderBottom: activeTab === "gifts" ? "2px solid #db2777" : "none",
              fontWeight: activeTab === "gifts" ? "800" : "600",
              color: activeTab === "gifts" ? "#db2777" : "#64748b",
              cursor: "pointer",
              fontSize: "0.82rem"
            }}
          >
[Gift] Quà tặng
          </button>
          <button 
            onClick={() => setActiveTab("analytics")}
            style={{ 
              flex: 1, 
              padding: "12px", 
              border: "none", 
              background: activeTab === "analytics" ? "white" : "transparent", 
              borderBottom: activeTab === "analytics" ? "2px solid #10b981" : "none",
              fontWeight: activeTab === "analytics" ? "800" : "600",
              color: activeTab === "analytics" ? "#10b981" : "#64748b",
              cursor: "pointer",
              fontSize: "0.82rem"
            }}
          >
[Chart] Thống kê Live
          </button>
        </div>

        {/* Tab 1: Chat Feed */}
        {activeTab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
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
        )}

        {/* Tab 2: Gifts Ledger */}
        {activeTab === "gifts" && (
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
        )}

        {/* Tab 3: Analytics Dashboard */}
        {activeTab === "analytics" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "15px", flex: 1, overflowY: "auto" }}>
            
            {/* KPI Cards Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "10px", borderRadius: "10px", textAlign: "center" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: "700", color: "#1e3a8a" }}>Doanh thu Live</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "900", color: "#1d4ed8" }}>${revenue}</div>
              </div>
              <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "10px", borderRadius: "10px", textAlign: "center" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: "700", color: "#064e3b" }}>Số đơn chốt</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "900", color: "#059669" }}>{ordersCount} đơn</div>
              </div>
              <div style={{ background: "#fdf2f8", border: "1px solid #fbcfe8", padding: "10px", borderRadius: "10px", textAlign: "center" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: "700", color: "#5c0632" }}>Lượt xem cao nhất</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "900", color: "#db2777" }}>{maxViewers} viewer</div>
              </div>
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: "10px", borderRadius: "10px", textAlign: "center" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: "700", color: "#78350f" }}>Tỷ lệ chuyển đổi</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "900", color: "#d97706" }}>
                  {maxViewers > 0 ? ((ordersCount / maxViewers) * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>

            {/* Viewer Retention Chart */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "12px", borderRadius: "12px", height: "180px" }}>
              <h5 style={{ margin: "0 0 8px 0", fontSize: "0.78rem", fontWeight: "800", color: "#475569" }}>
                Biểu đồ lượng người xem
              </h5>
              {viewerHistory.length === 0 ? (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "120px", fontSize: "0.75rem", color: "#94a3b8", fontStyle: "italic" }}>
                  Đang thu thập dữ liệu...
                </div>
              ) : (
                <Line 
                  data={{
                    labels: viewerHistory.map(h => h.time),
                    datasets: [{
                      label: 'Người xem',
                      data: viewerHistory.map(h => h.count),
                      borderColor: '#3b82f6',
                      backgroundColor: 'rgba(59, 130, 246, 0.05)',
                      borderWidth: 2,
                      pointRadius: 2,
                      fill: true,
                      tension: 0.3
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { 
                        beginAtZero: true, 
                        ticks: { stepSize: 1, color: '#94a3b8', font: { size: 9 } },
                        grid: { color: '#f1f5f9' }
                      },
                      x: {
                        ticks: { color: '#94a3b8', font: { size: 9 } },
                        grid: { display: false }
                      }
                    }
                  }}
                />
              )}
            </div>

            {/* Top selling products list */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "12px", borderRadius: "12px" }}>
              <h5 style={{ margin: "0 0 8px 0", fontSize: "0.78rem", fontWeight: "800", color: "#475569" }}>
                Sản phẩm bán chạy trên Live
              </h5>
              {Object.keys(topProducts).length === 0 ? (
                <div style={{ fontSize: "0.75rem", color: "#94a3b8", fontStyle: "italic", textAlign: "center", padding: "5px 0" }}>
                  Chưa có đơn hàng nào được chốt.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {Object.values(topProducts)
                    .sort((a, b) => b.count - a.count)
                    .map((p, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem", background: "white", padding: "6px 10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                        <span style={{ fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }}>
                          {p.name}
                        </span>
                        <span style={{ color: "#ef4444", fontWeight: "800" }}>
                          {p.count} lượt chốt (${p.price * p.count})
                        </span>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>

          </div>
        )}

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

