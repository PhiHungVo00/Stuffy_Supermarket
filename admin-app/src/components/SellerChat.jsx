import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export default function SellerChat({ apiBase, getToken }) {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null); // Selected conversation thread
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Scroll to bottom when message log updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch all active chat rooms on load
  const fetchRooms = async () => {
    try {
      const res = await fetch(`${apiBase}/api/chat/rooms`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRooms(data);
      }
    } catch (err) {
      console.error('Error fetching chat rooms:', err);
    }
  };

  useEffect(() => {
    fetchRooms();
    
    // Polling rooms list periodically to stay updated
    const interval = setInterval(fetchRooms, 15000);
    return () => clearInterval(interval);
  }, []);

  // Set up WebSocket connection for incoming real-time messages
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    // Decode token to extract userId
    let userId = '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.id;
    } catch (e) {
      console.error('Error parsing token payload', e);
      return;
    }

    const newSocket = io(apiBase);
    setSocket(newSocket);

    // Join seller's user room
    newSocket.emit('JOIN_USER_ROOM', userId);

    newSocket.on('RECEIVE_MESSAGE', (msg) => {
      // 1. If message belongs to active thread, append it
      if (
        selectedRoom && 
        (msg.sender === selectedRoom.partner._id || msg.recipient === selectedRoom.partner._id)
      ) {
        setMessages(prev => {
          if (prev.find(m => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
        
        // Mark as read immediately on backend
        fetch(`${apiBase}/api/chat/history/${selectedRoom.partner._id}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        }).catch(err => console.error(err));
      }
      
      // 2. Refresh rooms list to update last messages and badges
      fetchRooms();
    });

    return () => {
      newSocket.disconnect();
    };
  }, [selectedRoom]);

  // Fetch history when active room is changed
  useEffect(() => {
    const fetchHistory = async () => {
      if (!selectedRoom) return;
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/api/chat/history/${selectedRoom.partner._id}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (res.ok) {
          const history = await res.json();
          setMessages(history);
          
          // Clear unread badge locally for this room
          setRooms(prev => prev.map(r => 
            r.partner._id === selectedRoom.partner._id ? { ...r, unreadCount: 0 } : r
          ));
        }
      } catch (err) {
        console.error('Error fetching message history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [selectedRoom]);

  // Send message handler
  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim() || !selectedRoom || !socket) return;

    const token = getToken();
    let userId = '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.id;
    } catch (e) {
      return;
    }

    const payload = {
      senderId: userId,
      recipientId: selectedRoom.partner._id,
      shopId: selectedRoom.shop?._id || undefined,
      message: input
    };

    socket.emit('SEND_MESSAGE', payload);
    setInput('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '30px', height: '600px', background: 'white', borderRadius: '24px', border: '1px solid var(--border-light)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', alignItems: 'stretch' }}>
      
      {/* LEFT PANE: CONVERSATION LIST */}
      <div style={{ borderRight: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)', background: 'white' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-main)' }}>Conversations</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Customer queries & messages</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
          {rooms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No active conversations.
            </div>
          ) : (
            rooms.map((room) => {
              const isSelected = selectedRoom?.partner._id === room.partner._id;
              return (
                <div 
                  key={room.partner._id}
                  onClick={() => setSelectedRoom(room)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '14px 16px', 
                    borderRadius: '16px', 
                    background: isSelected ? 'var(--primary-color)' : 'white',
                    color: isSelected ? 'white' : 'var(--text-main)',
                    marginBottom: '10px', 
                    cursor: 'pointer', 
                    border: '1px solid',
                    borderColor: isSelected ? 'var(--primary-color)' : 'var(--border-light)',
                    boxShadow: isSelected ? '0 10px 20px rgba(99,102,241,0.2)' : '0 2px 4px rgba(0,0,0,0.02)',
                    transition: 'all 0.2s' 
                  }}
                  onMouseOver={e => !isSelected && (e.currentTarget.style.borderColor = 'var(--primary-color)')}
                  onMouseOut={e => !isSelected && (e.currentTarget.style.borderColor = 'var(--border-light)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden', flex: 1 }}>
                    <div style={{ 
                      width: '40px', 
                      height: '40px', 
                      borderRadius: '50%', 
                      background: isSelected ? 'rgba(255,255,255,0.2)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', 
                      color: 'white', 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      fontWeight: 'bold',
                      flexShrink: 0
                    }}>
                      {room.partner.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.partner.name}</div>
                      <div style={{ 
                        fontSize: '0.78rem', 
                        opacity: 0.8,
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        color: isSelected ? 'white' : 'var(--text-muted)' 
                      }}>
                        {room.lastMessage}
                      </div>
                    </div>
                  </div>

                  {room.unreadCount > 0 && (
                    <div style={{ 
                      minWidth: '20px', 
                      height: '20px', 
                      borderRadius: '10px', 
                      background: isSelected ? 'white' : '#ef4444', 
                      color: isSelected ? 'var(--primary-color)' : 'white', 
                      fontSize: '0.75rem', 
                      fontWeight: 'bold', 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      padding: '0 6px',
                      marginLeft: '8px'
                    }}>
                      {room.unreadCount}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANE: CHAT LOG */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedRoom ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', background: '#f8fafc' }}>
            <div style={{ fontSize: '4rem', marginBottom: '15px' }}>💬</div>
            <h3 style={{ margin: '0 0 6px 0', color: 'var(--text-main)', fontWeight: 'bold' }}>Customer Live Chat</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Select a conversation from the sidebar to start chatting.</p>
          </div>
        ) : (
          <React.Fragment>
            {/* Header info */}
            <div style={{ padding: '20px 30px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '1.1rem' }}>
                {selectedRoom.partner.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-main)' }}>{selectedRoom.partner.name}</h4>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Customer ID: #{selectedRoom.partner._id.substring(18)}</p>
              </div>
            </div>

            {/* Messages box */}
            <div style={{ flex: 1, padding: '30px', overflowY: 'auto', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {loading ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>Loading conversation history...</div>
              ) : (
                messages.map((m, idx) => {
                  const isMe = m.sender !== selectedRoom.partner._id;
                  return (
                    <div 
                      key={idx}
                      style={{ 
                        alignSelf: isMe ? 'flex-end' : 'flex-start', 
                        maxWidth: '75%', 
                        padding: '12px 18px', 
                        borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', 
                        background: isMe ? 'var(--primary-color)' : 'white', 
                        color: isMe ? 'white' : 'var(--text-main)', 
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                        fontSize: '0.92rem',
                        lineHeight: '1.4'
                      }}
                    >
                      <div>{m.message}</div>
                      <div style={{ fontSize: '0.65rem', opacity: 0.7, textAlign: 'right', marginTop: '4px' }}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input action */}
            <form onSubmit={handleSend} style={{ padding: '20px 30px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '15px', background: 'white' }}>
              <input 
                type="text" 
                placeholder={`Type a reply to ${selectedRoom.partner.name}...`} 
                value={input}
                onChange={e => setInput(e.target.value)}
                style={{ flex: 1, padding: '14px 20px', borderRadius: '99px', border: '1px solid var(--border-light)', outline: 'none', fontSize: '0.92rem' }}
              />
              <button 
                type="submit" 
                disabled={!input.trim()}
                style={{ 
                  padding: '12px 30px', 
                  borderRadius: '99px', 
                  border: 'none', 
                  background: 'var(--primary-color)', 
                  color: 'white', 
                  fontWeight: '700', 
                  cursor: input.trim() ? 'pointer' : 'not-allowed', 
                  opacity: input.trim() ? 1 : 0.5,
                  fontSize: '0.9rem',
                  boxShadow: '0 4px 10px rgba(99,102,241,0.2)'
                }}
              >
                Send
              </button>
            </form>
          </React.Fragment>
        )}
      </div>

    </div>
  );
}
