import React, { useState } from "react";

const ReviewManager = ({ products, apiBase, getToken, onRefresh }) => {
  const [replyTexts, setReplyTexts] = useState({}); // { [reviewId]: 'text' }
  const [loadingIds, setLoadingIds] = useState({}); // { [reviewId]: true/false }

  // Extract all reviews from products
  const reviewsList = [];
  products.forEach(product => {
    if (product.reviews && product.reviews.length > 0) {
      product.reviews.forEach(review => {
        reviewsList.push({
          productId: product.id || product._id,
          productName: product.name,
          ...review
        });
      });
    }
  });

  // Sort reviews by creation date (newest first)
  reviewsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const handleReplyChange = (reviewId, text) => {
    setReplyTexts(prev => ({ ...prev, [reviewId]: text }));
  };

  const submitReply = async (productId, reviewId) => {
    const text = replyTexts[reviewId];
    if (!text || !text.trim()) return;

    setLoadingIds(prev => ({ ...prev, [reviewId]: true }));
    try {
      const res = await fetch(`${apiBase}/api/products/${productId}/reviews/${reviewId}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getToken()}`
        },
        body: JSON.stringify({ reply: text })
      });
      if (res.ok) {
        alert("Reply submitted successfully!");
        setReplyTexts(prev => ({ ...prev, [reviewId]: "" }));
        if (onRefresh) onRefresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to submit reply");
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoadingIds(prev => ({ ...prev, [reviewId]: false }));
    }
  };

  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(<span key={i} style={{ color: i <= Math.round(rating) ? '#f59e0b' : '#e2e8f0', fontSize: '1rem' }}>★</span>);
    }
    return <div style={{ display: 'flex', gap: '2px' }}>{stars}</div>;
  };

  return (
    <div className="ds-glass-card" style={{ padding: "30px" }}>
      <h2 style={{ margin: "0 0 25px 0", fontSize: "1.5rem", fontWeight: "800" }}>Customer Reviews Management</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginBottom: "30px" }}>
        View and respond to customer reviews on your shop products.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {reviewsList.length === 0 ? (
          <div style={{ padding: "50px", textAlign: "center", color: "var(--text-muted)", border: "2px dashed var(--border-light)", borderRadius: "16px" }}>
            <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "10px" }}>📝</span>
            No reviews received yet.
          </div>
        ) : (
          reviewsList.map(review => (
            <div key={review._id} style={{ padding: "20px", background: "white", borderRadius: "16px", border: "1px solid var(--border-light)", boxShadow: "0 4px 6px rgba(0,0,0,0.01)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "15px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ fontWeight: "800", color: "var(--primary-color)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                    Product: {review.productName}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontWeight: "700", color: "var(--text-main)" }}>{review.name}</span>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>({new Date(review.createdAt).toLocaleDateString()})</span>
                  </div>
                </div>
                {renderStars(review.rating)}
              </div>

              <p style={{ margin: "0 0 20px 0", color: "var(--text-main)", fontSize: "0.95rem", lineHeight: "1.6" }}>
                "{review.comment}"
              </p>

              {review.reply ? (
                <div style={{ padding: "15px", background: "#f8fafc", borderRadius: "12px", borderLeft: "4px solid #16a34a" }}>
                  <div style={{ fontWeight: "700", color: "var(--text-main)", fontSize: "0.85rem", marginBottom: "5px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>🏪</span> Phản hồi từ Shop (đã gửi ngày {new Date(review.repliedAt || review.updatedAt).toLocaleDateString()}):
                  </div>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: "1.5" }}>{review.reply}</p>
                </div>
              ) : (
                <div style={{ marginTop: "15px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <textarea
                    placeholder="Enter your response to this review..."
                    value={replyTexts[review._id] || ""}
                    onChange={e => handleReplyChange(review._id, e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light)",
                      background: "#f8fafc",
                      fontSize: "0.9rem",
                      minHeight: "70px",
                      resize: "vertical",
                      boxSizing: "border-box"
                    }}
                  />
                  <button
                    onClick={() => submitReply(review.productId, review._id)}
                    disabled={loadingIds[review._id] || !replyTexts[review._id]?.trim()}
                    style={{
                      alignSelf: "flex-end",
                      padding: "8px 20px",
                      borderRadius: "8px",
                      border: "none",
                      background: "var(--primary-color)",
                      color: "white",
                      fontWeight: "700",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      opacity: (loadingIds[review._id] || !replyTexts[review._id]?.trim()) ? 0.5 : 1
                    }}
                  >
                    {loadingIds[review._id] ? "Submitting..." : "Submit Response"}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ReviewManager;
