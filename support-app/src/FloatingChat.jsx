import React, { useState, useRef, useEffect } from 'react';

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';

export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hi there! I am the Stuffy AI Support. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input;
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setLoading(true);

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
      
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: data.answer,
        suggestions: data.suggestedProducts
      }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'ai', text: "Error: " + err.message }]);
    } finally {
      setLoading(false);
    }
  };

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
          💬
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="ai-copilot-window" style={{ width: '380px', height: '550px', background: 'white', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
          {/* Header */}
          <div style={{ background: 'var(--primary-color)', padding: '20px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.3rem' }}>⚡</div>
                <div>
                   <div style={{ fontWeight: 'bold' }}>Stuffy Support</div>
                   <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Online · AI Agent</div>
                </div>
             </div>
             <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5rem', opacity: 0.8 }}>×</button>
          </div>

          {/* Messages */}
          <div className="chat-messages" style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', background: '#f8fafc' }}>
             {messages.map((m, i) => (
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
                   
                   {/* 🎁 AI Suggested Products Rendering */}
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
             {loading && (
               <div style={{ alignSelf: 'flex-start', background: 'white', padding: '10px 15px', borderRadius: '16px', fontSize: '0.8rem', color: '#64748b' }}>
                  Stuffy is thinking...
               </div>
             )}
             <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSend} style={{ padding: '20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '10px', background: 'white' }}>
             <input 
               type="text" 
               placeholder="Write a message..." 
               value={input}
               onChange={(e) => setInput(e.target.value)}
               disabled={loading}
               style={{ flex: 1, padding: '12px 16px', borderRadius: '99px', border: '1px solid var(--border-light)', outline: 'none', fontSize: '0.9rem' }} 
             />
             <button type="submit" disabled={loading} style={{ width: '45px', height: '45px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: loading ? 0.6 : 1 }}>
                🚀
             </button>
          </form>
        </div>
      )}
    </div>
  );
}
