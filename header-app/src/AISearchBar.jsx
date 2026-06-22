import React, { useState, useRef, useEffect } from 'react';
// @ts-ignore
import { useI18nStore } from 'store/i18n';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const AI_ENABLED = GEMINI_API_KEY.length > 10; // Only active when key is properly configured
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;



async function callGemini(userQuery, products) {
  const productList = products.map(p => `- ${p.name} ($${p.price}): ${p.description || 'No description'}`).join('\n');
  
  const prompt = `You are a smart shopping assistant for Stuffy Market, a tech retail platform.
The customer is looking for: "${userQuery}"

Available products in the store:
${productList}

Your task:
1. Write a brief, friendly 1-2 sentence analysis of the customer's needs.
2. Return a JSON array of the most relevant product names (use EXACT names from the list, max 4 products).

Respond ONLY with the following JSON format, no extra text:
{
  "message": "Brief analysis of the customer's request (friendly, concise)",
  "matches": ["Exact Product Name 1", "Exact Product Name 2"]
}`;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
    })
  });

  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  // Extract JSON from response (Gemini sometimes wraps it in ```json ```)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini returned invalid JSON');
  return JSON.parse(jsonMatch[0]);
}

export default function AISearchBar() {
  const { t } = useI18nStore();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [focused, setFocused] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef(null);
  const lastCallRef = useRef(0);
  const cooldownTimer = useRef(null);

  useEffect(() => {
    const handleReset = () => { setQuery(''); setAiResult(null); };
    window.addEventListener('AI_SEARCH_RESET', handleReset);
    return () => {
      window.removeEventListener('AI_SEARCH_RESET', handleReset);
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const startCooldown = (seconds) => {
    setCooldown(seconds);
    cooldownTimer.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownTimer.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSearch = async (e) => {
    if (e.key !== 'Enter' || !query.trim() || loading || cooldown > 0) return;
    
    const now = Date.now();
    if (now - lastCallRef.current < 3000) {
      setAiResult({ message: t('too_fast'), matches: [] });
      return;
    }
    
    setLoading(true);
    setAiResult(null);
    lastCallRef.current = now;

    try {
      // Calling our NEW Centralized AI Backend Search
      const response = await fetch('https://stuffy-backend-api.onrender.com/api/ai/context-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (!response.ok) throw new Error('AI Service unavailable');
      
      const result = await response.json();
      
      // Adapt backend response to frontend view
      const adaptedResult = {
        message: result.reasoning,
        matches: result.matches.map(p => p.name)
      };

      setAiResult(adaptedResult);
      
      // Dispatch event to app to highlight these products
      window.dispatchEvent(new CustomEvent('AI_SEARCH_RESULT', { 
        detail: { matches: adaptedResult.matches, query } 
      }));

    } catch (err) {
      setAiResult({ message: `${t('ai_error')}: ${err.message}`, matches: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setAiResult(null);
    window.dispatchEvent(new CustomEvent('AI_SEARCH_RESULT', { detail: { matches: null } }));
    inputRef.current?.focus();
  };

  return (
    <div style={{ width: '480px', position: 'relative' }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .ai-search-glow:focus-within {
          box-shadow: 0 0 0 3px rgba(99,102,241,0.15), 0 4px 20px rgba(99,102,241,0.1);
        }
      `}</style>

      {/* Ô Input */}
      <div className="ai-search-glow" style={{
        position: 'relative',
        borderRadius: '99px',
        background: focused ? 'white' : '#f1f5f9',
        border: `1.5px solid ${focused ? '#a5b4fc' : 'var(--border-light)'}`,
        transition: 'all 0.25s',
      }}>
        {/* Icon AI / Loading */}
        <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '1.15rem', pointerEvents: 'none' }}>
          {loading ? (
            <span style={{
              display: 'inline-block',
              width: '18px', height: '18px',
              border: '2px solid #e0e7ff',
              borderTopColor: '#6366f1',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }} />
          ) : aiResult ? '✨' : '🔍'}
        </span>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleSearch}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={
            cooldown > 0 ? t('cooldown_msg', { seconds: cooldown }) :
            loading ? t('ai_analyzing') : 
            t('ask_ai_placeholder')
          }
          disabled={loading || cooldown > 0}
          style={{
            width: '100%',
            padding: '13px 45px 13px 48px',
            borderRadius: '99px',
            border: 'none',
            background: 'transparent',
            outline: 'none',
            fontFamily: 'inherit',
            fontSize: '0.97rem',
            color: 'var(--text-main)',
            boxSizing: 'border-box',
          }}
        />

        {/* Nút X hoặc nhãn AI */}
        {query ? (
          <button onClick={handleClear} style={{
            position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
            background: '#e2e8f0', border: 'none', borderRadius: '50%',
            width: '22px', height: '22px', cursor: 'pointer',
            fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        ) : (
          <span style={{
            position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
            fontSize: '0.7rem', fontWeight: '800', letterSpacing: '0.5px',
            background: 'linear-gradient(90deg, #6366f1, #a855f7)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            pointerEvents: 'none',
          }}>AI ✦</span>
        )}
      </div>

      {/* Kết quả gợi ý của AI (dropdown) */}
      {aiResult && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', left: 0, right: 0,
          background: 'white', borderRadius: '18px',
          border: '1px solid #e0e7ff',
          boxShadow: '0 20px 50px rgba(99,102,241,0.15)',
          padding: '18px 20px',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease',
        }}>
          <style>{'@keyframes fadeIn { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }'}</style>
          
          {/* Nhãn AI */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.2rem' }}>✨</span>
            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('gemini_ai_suggestion')}</span>
          </div>
          
          {/* Lời nhận xét của AI */}
          <p style={{ margin: '0 0 14px 0', fontSize: '0.95rem', color: '#475569', lineHeight: '1.5', fontStyle: 'italic' }}>
            "{aiResult.message}"
          </p>

          {aiResult.matches?.length > 0 && (
            <>
              <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t('best_matches')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {aiResult.matches.map((name, i) => (
                  <span key={i} style={{
                    padding: '6px 14px', background: '#eef2ff', color: '#4338ca',
                    borderRadius: '99px', fontSize: '0.88rem', fontWeight: '700',
                    border: '1px solid #c7d2fe',
                  }}>
                    {name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  );
}
