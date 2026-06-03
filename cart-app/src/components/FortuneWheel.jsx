import React, { useState, useRef } from "react";
// @ts-ignore
import { useI18nStore } from "store/i18n";

const SEGMENTS = [
  { label: "5% Off",      discount: 0.05, color: "#6366f1", emoji: "✨" },
  { label: "Free Item",   discount: 0,    color: "#f59e0b", emoji: "🎁", freeItem: true },
  { label: "10% Off",     discount: 0.10, color: "#10b981", emoji: "💚" },
  { label: "No luck",     discount: 0,    color: "#ec4899", emoji: "😢", miss: true },
  { label: "20% Off",     discount: 0.20, color: "#ef4444", emoji: "🔥" },
  { label: "15% Off",     discount: 0.15, color: "#8b5cf6", emoji: "💜" },
  { label: "Free Ship",   discount: 0,    color: "#0ea5e9", emoji: "🚀", freeShip: true },
  { label: "No luck",     discount: 0,    color: "#94a3b8", emoji: "😅", miss: true },
];

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 10;
const NUM = SEGMENTS.length;
const ANGLE = 360 / NUM;

// Dựng VPath hình quạt bằng SVG Path
function slicePath(index) {
  const startDeg = index * ANGLE - 90;
  const endDeg = startDeg + ANGLE;
  const start = polar(CENTER, RADIUS, startDeg);
  const end = polar(CENTER, RADIUS, endDeg);
  return `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 0 1 ${end.x} ${end.y} Z`;
}

function polar(cx, cy, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + RADIUS * Math.cos(rad), y: cy + RADIUS * Math.sin(rad) };
}

function textPos(index) {
  const midDeg = index * ANGLE + ANGLE / 2 - 90;
  const r = RADIUS * 0.65;
  const rad = (midDeg * Math.PI) / 180;
  return {
    x: CENTER + r * Math.cos(rad),
    y: CENTER + r * Math.sin(rad),
    rotate: midDeg + 90,
  };
}

export default function FortuneWheel({ total, onApplyDiscount, onClose }) {
  const { lang, t } = useI18nStore();
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);
  const wheelRef = useRef(null);
  const hasSpun = useRef(false);

  // Dynamic segments mapping for localization
  const localizedSegments = SEGMENTS.map(seg => {
    let label = seg.label;
    if (lang === 'vi') {
      if (seg.label === "5% Off") label = "Giảm 5%";
      else if (seg.label === "10% Off") label = "Giảm 10%";
      else if (seg.label === "15% Off") label = "Giảm 15%";
      else if (seg.label === "20% Off") label = "Giảm 20%";
      else if (seg.label === "Free Item") label = "Tặng Quà";
      else if (seg.label === "Free Ship") label = "Freeship";
      else if (seg.label === "No luck") label = seg.emoji === "😢" ? "May mắn sau" : "Chúc may mắn";
    }
    return { ...seg, label };
  });

  const spin = () => {
    if (spinning || hasSpun.current) return;
    hasSpun.current = true;
    setSpinning(true);
    setResult(null);

    const winIndex = Math.floor(Math.random() * NUM);
    // Xoay 5-7 vòng + đúng góc trúng thưởng
    const extraSpins = 5 + Math.floor(Math.random() * 3);
    // Điều chỉnh góc để con trỏ (12 giờ) trỏ đúng vào segment
    const targetRotation =
      rotation + extraSpins * 360 + (360 - (winIndex * ANGLE + ANGLE / 2));
    
    setRotation(targetRotation);

    setTimeout(() => {
      setSpinning(false);
      setResult(localizedSegments[winIndex]);
    }, 4200);
  };

  const handleApply = () => {
    if (result) {
      onApplyDiscount(result);
      onClose();
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99998,
      background: "rgba(15,23,42,0.85)", backdropFilter: "blur(20px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeInOverlay 0.3s ease",
    }}>
      <style>{`
        @keyframes fadeInOverlay { from { opacity:0 } to { opacity:1 } }
        @keyframes popIn { from { transform: scale(0.85); opacity:0 } to { transform: scale(1); opacity:1 } }
        @keyframes shinePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4) } 50% { box-shadow: 0 0 40px 10px rgba(99,102,241,0.2) } }
        @keyframes resultPop { from { transform: scale(0.5) translateY(20px); opacity:0 } to { transform: scale(1) translateY(0); opacity:1 } }
        .wheel-card { animation: popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }
      `}</style>

      <div className="wheel-card" style={{
        background: "white", borderRadius: "28px",
        padding: "40px 50px", maxWidth: "520px", width: "90%",
        textAlign: "center", boxShadow: "0 40px 100px rgba(0,0,0,0.4)",
        animation: "popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both, shinePulse 2s 0.5s infinite",
        position: "relative",
      }}>
        {/* Nút thoát */}
        <button onClick={onClose} style={{
          position: "absolute", top: "15px", right: "20px",
          background: "none", border: "none", fontSize: "1.8rem",
          cursor: "pointer", color: "#94a3b8", lineHeight: 1,
        }}>×</button>

        <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>🎰</div>
        <h2 style={{ margin: "0 0 4px 0", fontSize: "1.8rem", fontWeight: "900", letterSpacing: "-0.5px" }}>
          {t('spin_and_win')}
        </h2>
        <p style={{ color: "#64748b", margin: "0 0 28px 0", fontSize: "0.95rem" }}>
          {t('one_free_spin', { total })}
        </p>

        {/* Vòng quay SVG */}
        <div style={{ position: "relative", display: "inline-block", marginBottom: "24px" }}>
          {/* Con trỏ (mũi tên) */}
          <div style={{
            position: "absolute", top: "-14px", left: "50%", transform: "translateX(-50%)",
            zIndex: 10, fontSize: "2rem", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.3))",
          }}>🔽</div>

          {/* Vành ngoài */}
          <div style={{
            padding: "6px", borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1, #a855f7, #ec4899)",
            boxShadow: "0 10px 40px rgba(99,102,241,0.4)",
          }}>
            <svg
              ref={wheelRef}
              width={SIZE}
              height={SIZE}
              style={{
                borderRadius: "50%",
                transition: spinning ? "transform 4s cubic-bezier(0.17,0.67,0.12,1)" : "none",
                transform: `rotate(${rotation}deg)`,
                display: "block",
              }}
            >
              {localizedSegments.map((seg, i) => {
                const tp = textPos(i);
                return (
                  <g key={i}>
                    <path d={slicePath(i)} fill={seg.color} stroke="white" strokeWidth="2" />
                    <text
                      x={tp.x} y={tp.y}
                      textAnchor="middle" dominantBaseline="central"
                      transform={`rotate(${tp.rotate}, ${tp.x}, ${tp.y})`}
                      style={{ fontSize: "11px", fontWeight: "800", fill: "white", pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
                    >
                      <tspan x={tp.x} dy="-6">{seg.emoji}</tspan>
                      <tspan x={tp.x} dy="14">{seg.label}</tspan>
                    </text>
                  </g>
                );
              })}
              {/* Tâm vòng quay */}
              <circle cx={CENTER} cy={CENTER} r={22} fill="white" stroke="#e2e8f0" strokeWidth="3" />
              <text x={CENTER} y={CENTER} textAnchor="middle" dominantBaseline="central" style={{ fontSize: "16px" }}>🎯</text>
            </svg>
          </div>
        </div>

        {/* Kết quả */}
        {result && (
          <div style={{
            animation: "resultPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
            background: result.miss ? "#f1f5f9" : "linear-gradient(135deg, #f0fdf4, #dcfce7)",
            border: `2px solid ${result.miss ? "#e2e8f0" : "#86efac"}`,
            borderRadius: "16px", padding: "16px 20px", marginBottom: "16px",
          }}>
            <div style={{ fontSize: "2rem", marginBottom: "4px" }}>{result.emoji}</div>
            <p style={{ margin: 0, fontWeight: "900", fontSize: "1.3rem", color: result.miss ? "#94a3b8" : "#15803d" }}>
              {result.miss ? t('better_luck') : t('you_got', { label: result.label })}
            </p>
            {!result.miss && (
              <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.9rem" }}>
                {result.discount > 0
                  ? t('you_save', { save: (total * result.discount).toFixed(2), total: (total * (1 - result.discount)).toFixed(2) })
                  : result.freeShip ? t('free_ship_applied')
                  : t('free_item_applied')}
              </p>
            )}
          </div>
        )}

        {/* Nút Quay / Áp dụng */}
        {!result ? (
          <button onClick={spin} disabled={spinning} style={{
            width: "100%", padding: "16px", borderRadius: "14px", border: "none",
            background: spinning ? "#e2e8f0" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: spinning ? "#94a3b8" : "white",
            fontSize: "1.15rem", fontWeight: "800", cursor: spinning ? "not-allowed" : "pointer",
            transition: "all 0.2s", letterSpacing: "-0.2px",
            boxShadow: spinning ? "none" : "0 8px 25px rgba(99,102,241,0.4)",
            transform: "translateY(0)",
          }}
          onMouseOver={e => { if (!spinning) e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseOut={e => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            {spinning ? t('spinning') : t('spin_now')}
          </button>
        ) : result.miss ? (
          <button onClick={onClose} style={{
            width: "100%", padding: "16px", borderRadius: "14px", border: "none",
            background: "#f1f5f9", color: "#64748b",
            fontSize: "1.1rem", fontWeight: "700", cursor: "pointer",
          }}>
            {t('close')}
          </button>
        ) : (
          <div style={{ display: "flex", gap: "12px" }}>
            <button onClick={onClose} style={{
              flex: 1, padding: "14px", borderRadius: "12px", border: "1px solid #e2e8f0",
              background: "white", color: "#64748b", fontWeight: "700", cursor: "pointer",
            }}>{t('skip')}</button>
            <button onClick={handleApply} style={{
              flex: 2, padding: "14px", borderRadius: "12px", border: "none",
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "white", fontWeight: "800", cursor: "pointer",
              fontSize: "1.05rem",
              boxShadow: "0 6px 20px rgba(16,185,129,0.35)",
            }}>
              {t('apply_discount')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
