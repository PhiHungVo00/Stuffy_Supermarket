import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
// @ts-ignore
import { useI18nStore } from "store/i18n";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';

export default function FloatingChat() {
  const { t } = useI18nStore();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('ai'); // 'ai' or 'seller'
  
  // AI Copilot State
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Seller Chat State
  const [selectedShop, setSelectedShop] = useState(null); // Active shop being messaged
  const [shopList, setShopList] = useState([]); // List of shops to select from
  const [sellerMessages, setSellerMessages] = useState([]);
  const [sellerInput, setSellerInput] = useState('');
  const [socket, setSocket] = useState(null);
  const [currentViewProduct, setCurrentViewProduct] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [showOrderAttach, setShowOrderAttach] = useState(false);
  
  const chatEndRef = useRef(null);
  const sellerChatEndRef = useRef(null);

  // Initialize welcome message dynamically on mount and locale change
  useEffect(() => {
    setAiMessages([
      { role: 'ai', text: t('ai_support_welcome') }
    ]);
  }, [t]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollSellerToBottom = () => {
    sellerChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll triggers
  useEffect(() => {
    if (activeTab === 'ai') {
      scrollToBottom();
    } else {
      scrollSellerToBottom();
    }
  }, [aiMessages, sellerMessages, activeTab]);

  // Listen for the custom event to open a seller chat directly
  useEffect(() => {
    const handleOpenChat = (e) => {
      if (e.detail && e.detail.shop) {
        setIsOpen(true);
        setActiveTab('seller');
        setSelectedShop(e.detail.shop);
      }
    };

    window.addEventListener("OPEN_SELLER_CHAT", handleOpenChat);
    return () => {
      window.removeEventListener("OPEN_SELLER_CHAT", handleOpenChat);
    };
  }, []);

  // Load currentViewShop from localStorage or retrieve list of active shops
  useEffect(() => {
    if (isOpen && activeTab === 'seller') {
      // 1. Check if user is viewing a product with an associated shop
      const currentViewShopStr = localStorage.getItem('currentViewShop');
      if (currentViewShopStr) {
        try {
          const shop = JSON.parse(currentViewShopStr);
          setSelectedShop(shop);
        } catch (e) {
          console.error('Error parsing currentViewShop', e);
        }
      }
      
      // 2. Fetch all shops so user has a list to select from if they want to switch
      const fetchShops = async () => {
        try {
          const tenantId = localStorage.getItem('tenantId') || 'default_store';
          const res = await fetch(`${API_BASE}/api/shops`, {
            headers: { 'x-tenant-id': tenantId }
          });
          if (res.ok) {
            const data = await res.json();
            setShopList(data);
          }
        } catch (err) {
          console.error('Error fetching shops:', err);
        }
      };
      fetchShops();
    }
  }, [isOpen, activeTab]);

  // Handle Socket.IO connections & Authentication for Seller Chat
  useEffect(() => {
    const userInfoString = localStorage.getItem('userInfo');
    if (!userInfoString || activeTab !== 'seller' || !isOpen) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const { _id: userId } = JSON.parse(userInfoString);
    const newSocket = io(API_BASE);
    setSocket(newSocket);

    // Join user room to receive incoming messages
    newSocket.emit('JOIN_USER_ROOM', userId);

    // Listen for incoming messages
    newSocket.on('RECEIVE_MESSAGE', (msg) => {
      // Only append if it belongs to the current conversation partner
      const msgSenderId = msg.sender?._id || msg.sender;
      const msgRecipientId = msg.recipient?._id || msg.recipient;
      const partnerOwnerId = selectedShop?.owner?._id || selectedShop?.owner;
      
      if (
        selectedShop && partnerOwnerId && 
        (msgSenderId === partnerOwnerId || msgRecipientId === partnerOwnerId)
      ) {
        setSellerMessages(prev => {
          // Check if message is already in list to prevent duplicates
          if (prev.find(m => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [activeTab, isOpen, selectedShop]);

  // Fetch Message History and relevant details when selectedShop changes
  useEffect(() => {
    const fetchChatData = async () => {
      if (!selectedShop || !selectedShop.owner) return;
      const userInfoString = localStorage.getItem('userInfo');
      if (!userInfoString) return;
      
      const { token } = JSON.parse(userInfoString);
      
      // 1. Fetch History
      try {
        const res = await fetch(`${API_BASE}/api/chat/history/${selectedShop.owner}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const history = await res.json();
          setSellerMessages(history);
        }
      } catch (err) {
        console.error('Error fetching history:', err);
      }

      // 2. Load current viewed product if it belongs to this shop
      const prodStr = localStorage.getItem('currentViewProduct');
      if (prodStr) {
        try {
          const prod = JSON.parse(prodStr);
          const shopStr = localStorage.getItem('currentViewShop');
          if (shopStr) {
            const shop = JSON.parse(shopStr);
            if (shop._id === selectedShop._id) {
              setCurrentViewProduct(prod);
            } else {
              setCurrentViewProduct(null);
            }
          } else {
            setCurrentViewProduct(null);
          }
        } catch (e) {
          setCurrentViewProduct(null);
        }
      } else {
        setCurrentViewProduct(null);
      }

      // 3. Fetch recent orders for this shop
      try {
        const res = await fetch(`${API_BASE}/api/orders/myorders`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const filtered = data.filter(order => {
              const oShopId = order.shop?._id || order.shop || '';
              return oShopId.toString() === selectedShop._id.toString();
            });
            setRecentOrders(filtered.slice(0, 5));
          }
        }
      } catch (err) {
        console.error('Error fetching recent orders for chat:', err);
      }
    };

    fetchChatData();
    setShowOrderAttach(false);
  }, [selectedShop]);

  // AI Copilot Send Handler
  const handleAiSend = async (e) => {
    e.preventDefault();
    if (!aiInput.trim() || aiLoading) return;

    const userMessage = aiInput;
    setAiMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setAiInput('');
    setAiLoading(true);

    try {
      const tenantId = localStorage.getItem('tenantId') || 'default_store';
      const response = await fetch(`${API_BASE}/api/ai/copilot/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({ query: userMessage })
      });

      if (!response.ok) throw new Error("AI Copilot Service Unavailable");
      
      const data = await response.json();
      
      setAiMessages(prev => [...prev, { 
        role: 'ai', 
        text: data.answer,
        suggestions: data.suggestedProducts
      }]);
    } catch (err) {
      console.error(err);
      setAiMessages(prev => [...prev, { role: 'ai', text: t('ai_error') + ": " + err.message }]);
    } finally {
      setAiLoading(false);
    }
  };

  // Seller Chat Send Handler
  const handleSellerSend = (e) => {
    e.preventDefault();
    const userInfoString = localStorage.getItem('userInfo');
    if (!userInfoString || !selectedShop || !selectedShop.owner || !socket || !sellerInput.trim()) return;

    const { _id: userId } = JSON.parse(userInfoString);
    const msgPayload = {
      senderId: userId,
      recipientId: selectedShop.owner,
      shopId: selectedShop._id,
      message: sellerInput
    };

    // Emit the socket event to trigger storage and real-time delivery
    socket.emit('SEND_MESSAGE', msgPayload);
    setSellerInput('');
  };

  const userInfo = localStorage.getItem('userInfo') ? JSON.parse(localStorage.getItem('userInfo')) : null;

  return (
    <div style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 9999 }}>
      {/* Toggle Button */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="ai-copilot-toggle"
          style={{ width: '60px', height: '60px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', fontSize: '1.8rem', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 10px 25px rgba(99,102,241,0.4)', transition: 'transform 0.2s' }}
          onMouseOver={e=>e.currentTarget.style.transform='scale(1.1)'}
          onMouseOut={e=>e.currentTarget.style.transform='scale(1)'}
        >
          [Chat]
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="ai-copilot-window" style={{ width: '380px', height: '550px', background: 'white', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
          
          {/* Header */}
          <div style={{ background: 'var(--primary-color)', padding: '15px 20px', color: 'white', display: 'flex', flexDirection: 'column', gap: '8px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
<div style={{ width: '32px', height: '32px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.1rem' }}>[⚡]</div>
                   <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{t('stuffy_customer_hub')}</div>
                </div>
                <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5rem', opacity: 0.8 }}>×</button>
             </div>
             
             {/* Tabs switcher */}
             <div style={{ display: 'flex', background: 'rgba(0,0,0,0.1)', padding: '3px', borderRadius: '8px' }}>
                <button 
                  onClick={() => setActiveTab('ai')}
                  style={{ flex: 1, border: 'none', padding: '6px', background: activeTab === 'ai' ? 'white' : 'transparent', color: activeTab === 'ai' ? 'var(--primary-color)' : 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.82rem', transition: 'all 0.2s' }}
                >
[Bot] {t('ai_copilot')}
                </button>
                <button 
                  onClick={() => setActiveTab('seller')}
                  style={{ flex: 1, border: 'none', padding: '6px', background: activeTab === 'seller' ? 'white' : 'transparent', color: activeTab === 'seller' ? 'var(--primary-color)' : 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.82rem', transition: 'all 0.2s' }}
                >
[Store] {t('shop_chat')}
                </button>
             </div>
          </div>

          {/* TAB 1: AI COPILOT CHAT */}
          {activeTab === 'ai' && (
            <React.Fragment>
              <div className="chat-messages" style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', background: '#f8fafc' }}>
                 {aiMessages.map((m, i) => (
                    <div key={i} style={{ 
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', 
                      maxWidth: '85%', 
                      padding: '12px 16px', 
                      borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', 
                      background: m.role === 'user' ? 'var(--primary-color)' : 'white', 
                      color: m.role === 'user' ? 'white' : 'var(--text-main)', 
                      boxShadow: m.role === 'user' ? '0 4px 10px rgba(99,102,241,0.2)' : '0 2px 5px rgba(0,0,0,0.05)',
                      fontSize: '0.92rem',
                      lineHeight: '1.5'
                    }}>
                       {m.text}
                       
                       {m.suggestions && m.suggestions.length > 0 && (
                          <div style={{ marginTop: '12px', display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px' }}>
                             {m.suggestions.map((p, idx) => (
                               <div key={idx} style={{ 
                                 minWidth: '140px', background: 'white', borderRadius: '12px', padding: '10px', 
                                 border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                 transition: 'transform 0.2s', cursor: 'pointer'
                               }} onMouseOver={e=>e.currentTarget.style.transform='translateY(-3px)'} onMouseOut={e=>e.currentTarget.style.transform='none'}>
                                  <img src={p.image} style={{ width: '100%', height: '80px', objectFit: 'contain', marginBottom: '8px' }} />
                                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-main)', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name}</div>
                                  <div style={{ fontSize: '0.85rem', fontWeight: '900', color: 'var(--primary-color)', marginTop: '4px' }}>${p.price}</div>
                               </div>
                             ))}
                          </div>
                       )}
                    </div>
                 ))}
                 {aiLoading && (
                    <div style={{ alignSelf: 'flex-start', background: 'white', padding: '10px 15px', borderRadius: '16px', fontSize: '0.8rem', color: '#64748b' }}>
                       {t('thinking')}
                    </div>
                 )}
                 <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleAiSend} style={{ padding: '20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '10px', background: 'white' }}>
                 <input 
                   type="text" 
                   placeholder={t('ask_stuffy_ai')} 
                   value={aiInput}
                   onChange={(e) => setAiInput(e.target.value)}
                   disabled={aiLoading}
                   style={{ flex: 1, padding: '12px 16px', borderRadius: '99px', border: '1px solid var(--border-light)', outline: 'none', fontSize: '0.9rem' }} 
                 />
                 <button type="submit" disabled={aiLoading} style={{ width: '45px', height: '45px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: aiLoading ? 0.6 : 1 }}>
[Rocket]
                 </button>
              </form>
            </React.Fragment>
          )}

          {/* TAB 2: SELLER DIRECT CHAT */}
          {activeTab === 'seller' && (
            <React.Fragment>
              {!userInfo ? (
                // Enforce authorization
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px', background: '#f8fafc', textAlign: 'center' }}>
<div style={{ fontSize: '3rem', marginBottom: '10px' }}>[Lock]</div>
                  <h4 style={{ margin: '0 0 6px 0', fontWeight: 'bold' }}>{t('auth_required')}</h4>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>{t('login_to_chat_desc')}</p>
                </div>
              ) : !selectedShop ? (
                // Shop select list if no active shop is chosen
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>
                  <div style={{ padding: '15px 20px', fontWeight: '800', fontSize: '0.95rem', borderBottom: '1px solid var(--border-light)', background: 'white' }}>
                    {t('select_shop_to_message')}
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    {shopList.length === 0 ? (
                      <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('no_active_shops')}</p>
                    ) : (
                      shopList.map(shop => (
                        <div 
                          key={shop._id}
                          onClick={() => setSelectedShop(shop)}
                          style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'white', borderRadius: '12px', marginBottom: '8px', cursor: 'pointer', border: '1px solid var(--border-light)', transition: 'all 0.2s' }}
                          onMouseOver={e=>e.currentTarget.style.borderColor='var(--primary-color)'}
                          onMouseOut={e=>e.currentTarget.style.borderColor='var(--border-light)'}
                        >
                          <img src={shop.logo || 'https://via.placeholder.com/50'} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                          <div>
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-main)' }}>{shop.name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{shop.description ? shop.description.substring(0, 45) + '...' : ''}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                // Direct message feed window with selectedShop
                <React.Fragment>
                  {/* Shop banner inside seller chat */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border-light)', background: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button 
                        onClick={() => setSelectedShop(null)} 
                        style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', padding: '0 5px 0 0', color: 'var(--text-muted)' }}
                      >
                        ←
                      </button>
                      <img src={selectedShop.logo || 'https://via.placeholder.com/50'} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.88rem', color: 'var(--text-main)' }}>{selectedShop.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 'bold' }}>{t('seller_store')}</div>
                      </div>
                    </div>
                  </div>

                  <div className="chat-messages" style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc' }}>
                     {sellerMessages.length === 0 ? (
                       <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                         {t('send_msg_start_conv')}
                       </div>
                     ) : (
                       sellerMessages.map((m, i) => {
                          const isMe = m.sender === userInfo._id;
                          return (
                            <div key={i} style={{ 
                              alignSelf: isMe ? 'flex-end' : 'flex-start', 
                              maxWidth: '85%', 
                              padding: '10px 14px', 
                              borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px', 
                              background: isMe ? 'var(--primary-color)' : 'white', 
                              color: isMe ? 'white' : 'var(--text-main)', 
                              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                              fontSize: '0.9rem',
                              lineHeight: '1.4'
                            }}>
                               {m.message}
                               
                               {/* Render Product Card */}
                               {m.attachmentType === 'product' && m.attachedProduct && (
                                 <div 
                                   onClick={() => window.location.href = `/product/${m.attachedProduct._id || m.attachedProduct.id}`}
                                   style={{ 
                                     background: isMe ? 'rgba(255,255,255,0.1)' : '#f8fafc', 
                                     padding: '10px', 
                                     borderRadius: '12px', 
                                     marginTop: '8px', 
                                     border: '1px solid rgba(0,0,0,0.08)', 
                                     display: 'flex', 
                                     gap: '10px', 
                                     alignItems: 'center', 
                                     cursor: 'pointer', 
                                     minWidth: '220px' 
                                   }}
                                 >
                                   <img 
                                     src={m.attachedProduct.image} 
                                     style={{ width: '40px', height: '40px', objectFit: 'contain', background: 'white', borderRadius: '6px' }} 
                                   />
                                   <div style={{ flex: 1, overflow: 'hidden' }}>
                                     <div style={{ fontSize: '0.78rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isMe ? 'white' : 'var(--text-main)' }}>
                                       {m.attachedProduct.name}
                                     </div>
                                     <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: isMe ? '#a5b4fc' : 'var(--primary-color)', marginTop: '2px' }}>
                                       ${m.attachedProduct.price}
                                     </div>
                                   </div>
                                 </div>
                               )}

                               {/* Render Order Card */}
                               {m.attachmentType === 'order' && m.attachedOrder && (
                                 <div 
                                   onClick={() => window.location.href = `/profile`}
                                   style={{ 
                                     background: isMe ? 'rgba(255,255,255,0.1)' : '#f8fafc', 
                                     padding: '10px', 
                                     borderRadius: '12px', 
                                     marginTop: '8px', 
                                     border: '1px solid rgba(0,0,0,0.08)', 
                                     minWidth: '220px', 
                                     cursor: 'pointer' 
                                   }}
                                 >
                                   <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: isMe ? '#e0e7ff' : 'var(--text-muted)' }}>
                                     ĐƠN HÀNG: #{m.attachedOrder._id ? m.attachedOrder._id.substring(0, 8).toUpperCase() : 'N/A'}
                                   </div>
                                   <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', alignItems: 'center' }}>
                                     <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: isMe ? 'white' : 'var(--text-main)' }}>
                                       Tổng: ${m.attachedOrder.totalPrice?.toFixed(2)}
                                     </div>
                                     <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '8px', background: isMe ? 'rgba(255,255,255,0.2)' : '#e2e8f0', color: isMe ? 'white' : 'var(--text-main)', fontWeight: 'bold' }}>
                                       {m.attachedOrder.status}
                                     </span>
                                   </div>
                                 </div>
                               )}

                               <div style={{ fontSize: '0.65rem', opacity: 0.7, textAlign: 'right', marginTop: '4px' }}>
                                 {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                               </div>
                            </div>
                          );
                       })
                     )}
                     <div ref={sellerChatEndRef} />
                  </div>

                  {/* Product Attachment Preview Panel */}
                  {currentViewProduct && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 15px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <img src={currentViewProduct.image} style={{ width: '28px', height: '28px', objectFit: 'contain', background: 'white', borderRadius: '4px' }} />
                        <div style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                          <strong>{currentViewProduct.name}</strong><br/>
                          <span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>${currentViewProduct.price}</span>
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={() => {
                          const userInfoString = localStorage.getItem('userInfo');
                          if (!userInfoString || !selectedShop || !selectedShop.owner || !socket) return;
                          const { _id: userId } = JSON.parse(userInfoString);
                          socket.emit('SEND_MESSAGE', {
                            senderId: userId,
                            recipientId: selectedShop.owner,
                            shopId: selectedShop._id,
                            message: `[Thẻ sản phẩm] ${currentViewProduct.name}`,
                            attachmentType: 'product',
                            attachedProduct: currentViewProduct._id
                          });
                        }}
                        style={{ padding: '3px 8px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Gửi sản phẩm
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSellerSend} style={{ padding: '20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '10px', background: 'white', position: 'relative', alignItems: 'center' }}>
                     {recentOrders.length > 0 && (
                       <button
                         type="button"
                         onClick={() => setShowOrderAttach(!showOrderAttach)}
                         style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', padding: '0 5px' }}
                         title="Đính kèm đơn hàng"
                       >
[Box]
                       </button>
                     )}
                     
                     <input 
                       type="text" 
                       placeholder={t('message_shop_placeholder', { name: selectedShop.name })} 
                       value={sellerInput}
                       onChange={(e) => setSellerInput(e.target.value)}
                       style={{ flex: 1, padding: '12px 16px', borderRadius: '99px', border: '1px solid var(--border-light)', outline: 'none', fontSize: '0.9rem' }} 
                     />
                     <button type="submit" disabled={!sellerInput.trim()} style={{ width: '45px', height: '45px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: sellerInput.trim() ? 1 : 0.5 }}>
    [Rocket]
                     </button>

                     {/* Order Attachment Dropdown */}
                     {showOrderAttach && (
                       <div style={{ position: 'absolute', bottom: '75px', left: '15px', width: '310px', maxHeight: '200px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflowY: 'auto', zIndex: 10 }}>
                         <div style={{ padding: '8px 12px', fontWeight: 'bold', fontSize: '0.8rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>Đính kèm đơn hàng của bạn</div>
                         {recentOrders.map(order => (
                           <div 
                             key={order._id}
                             onClick={() => {
                               const userInfoString = localStorage.getItem('userInfo');
                               if (!userInfoString || !selectedShop || !selectedShop.owner || !socket) return;
                               const { _id: userId } = JSON.parse(userInfoString);
                               socket.emit('SEND_MESSAGE', {
                                 senderId: userId,
                                 recipientId: selectedShop.owner,
                                 shopId: selectedShop._id,
                                 message: `[Thẻ đơn hàng] #${order._id.substring(0, 8)}`,
                                 attachmentType: 'order',
                                 attachedOrder: order._id
                               });
                               setShowOrderAttach(false);
                             }}
                             style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                             onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                             onMouseOut={e => e.currentTarget.style.background = 'white'}
                           >
                             <div style={{ fontSize: '0.75rem', textAlign: 'left' }}>
                               <strong>#{order._id.substring(0, 8).toUpperCase()}</strong><br/>
                               <span style={{ color: 'var(--text-muted)' }}>{new Date(order.createdAt).toLocaleDateString()}</span>
                             </div>
                             <div style={{ textAlign: 'right', fontSize: '0.75rem' }}>
                               <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>${order.totalPrice?.toFixed(2)}</span><br/>
                               <span style={{ fontSize: '0.65rem', color: '#16a34a', fontWeight: 'bold' }}>{order.status}</span>
                             </div>
                           </div>
                         ))}
                       </div>
                     )}
                  </form>
                </React.Fragment>
              )}
            </React.Fragment>
          )}

        </div>
      )}
    </div>
  );
}
