import React, { useState, useEffect } from "react";

export default function ShopDecorator({ apiBase, getToken }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shop, setShop] = useState(null);
  const [myProducts, setMyProducts] = useState([]);
  const [widgets, setWidgets] = useState([]);

  // Fetch shop information & products
  useEffect(() => {
    const fetchShopAndProducts = async () => {
      setLoading(true);
      try {
        const token = getToken();
        // 1. Fetch shop info
        const shopRes = await fetch(`${apiBase}/api/shops/mine`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const shopData = await shopRes.json();
        if (shopData && !shopData.error) {
          setShop(shopData);
          if (shopData.decorationConfig) {
            setWidgets(shopData.decorationConfig.widgets || []);
          } else {
            // Default pre-loaded config
            setWidgets([
              {
                id: "carousel-" + Date.now(),
                type: "carousel",
                title: "Grand Opening Promotion Banners",
                images: [
                  "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=800&h=300&q=80",
                  "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&h=300&q=80"
                ]
              },
              {
                id: "featured-" + Date.now(),
                type: "featured",
                title: "Sizzling Hot Recommendations",
                productIds: []
              },
              {
                id: "text-" + Date.now(),
                type: "text",
                title: "Welcome Greeting & Policy Details",
                content: "### Welcome to our Official Store!\n\nWe provide **100% authentic** organic foods and tech goods. Free shipping is available via GHN/GHTK on orders over $50! \nEnjoy dynamic cashback in **Stuffy Coins** on every purchase."
              }
            ]);
          }

          // 2. Fetch my products
          const prodRes = await fetch(`${apiBase}/api/products?pageNumber=1&pageSize=999&shop=${shopData._id}`);
          const prodData = await prodRes.json();
          setMyProducts(prodData.products || []);
        }
      } catch (err) {
        console.error("Error loading decoration details:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchShopAndProducts();
  }, [apiBase]);

  const saveDecoration = async () => {
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/api/shops/mine/decorate`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          decorationConfig: { widgets }
        })
      });
      if (res.ok) {
        alert("🎉 Store decoration saved and published successfully!");
      } else {
        const err = await res.json();
        alert("Failed to save layout: " + err.error);
      }
    } catch (err) {
      alert("Error saving: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const addWidget = (type) => {
    const newWidget = {
      id: `${type}-${Date.now()}`,
      type,
      title: `My New ${type.charAt(0).toUpperCase() + type.slice(1)} Widget`,
    };

    if (type === "carousel") {
      newWidget.images = [
        "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=800&h=300&q=80"
      ];
    } else if (type === "featured") {
      newWidget.productIds = [];
    } else if (type === "text") {
      newWidget.content = "Write some markdown or custom descriptions here.";
    }

    setWidgets([...widgets, newWidget]);
  };

  const removeWidget = (id) => {
    setWidgets(widgets.filter(w => w.id !== id));
  };

  const updateWidgetTitle = (id, newTitle) => {
    setWidgets(widgets.map(w => w.id === id ? { ...w, title: newTitle } : w));
  };

  const updateWidgetContent = (id, newContent) => {
    setWidgets(widgets.map(w => w.id === id ? { ...w, content: newContent } : w));
  };

  const addImageToCarousel = (id, url) => {
    setWidgets(widgets.map(w => {
      if (w.id === id) {
        return { ...w, images: [...w.images, url || "https://picsum.photos/800/300"] };
      }
      return w;
    }));
  };

  const removeImageFromCarousel = (widgetId, imgIdx) => {
    setWidgets(widgets.map(w => {
      if (w.id === widgetId) {
        const nextImgs = [...w.images];
        nextImgs.splice(imgIdx, 1);
        return { ...w, images: nextImgs };
      }
      return w;
    }));
  };

  const toggleProductInFeatured = (widgetId, productId) => {
    setWidgets(widgets.map(w => {
      if (w.id === widgetId) {
        const productIds = w.productIds || [];
        const nextIds = productIds.includes(productId)
          ? productIds.filter(id => id !== productId)
          : [...productIds, productId];
        return { ...w, productIds: nextIds };
      }
      return w;
    }));
  };

  if (loading) {
    return <div style={{ color: "var(--text-muted)", padding: "20px" }}>Loading decoration options...</div>;
  }

  if (!shop) {
    return <div style={{ color: "var(--text-muted)", padding: "20px" }}>No active shop profile found. Please log in as a seller.</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", alignItems: "start" }}>
      
      {/* Left panel: Widget Editor */}
      <div className="ds-glass-card" style={{ background: "white", padding: "30px", borderRadius: "16px", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "25px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.4rem", fontWeight: "800" }}>Storefront Decoration</h3>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>Design layout widgets for your shop homepage.</p>
          </div>
          <button 
            onClick={saveDecoration} 
            disabled={saving}
            style={{ padding: "10px 20px", borderRadius: "8px", background: "var(--primary-color)", color: "white", border: "none", fontWeight: "700", cursor: "pointer", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Saving Layout..." : "Publish Layout"}
          </button>
        </div>

        {/* Add widgets toolbar */}
        <div style={{ display: "flex", gap: "10px", padding: "12px", background: "#f8fafc", borderRadius: "10px", marginBottom: "20px", border: "1px solid var(--border-light)" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: "700", alignSelf: "center", color: "var(--text-muted)", marginRight: "5px" }}>Add Widget:</span>
          <button onClick={() => addWidget("carousel")} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #c7d2fe", background: "#e0e7ff", color: "#4f46e5", fontSize: "0.8rem", fontWeight: "700", cursor: "pointer" }}>Banners Carousel</button>
          <button onClick={() => addWidget("featured")} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #fed7aa", background: "#ffedd5", color: "#ea580c", fontSize: "0.8rem", fontWeight: "700", cursor: "pointer" }}>Featured Row</button>
          <button onClick={() => addWidget("text")} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #a7f3d0", background: "#d1fae5", color: "#059669", fontSize: "0.8rem", fontWeight: "700", cursor: "pointer" }}>Text Description</button>
        </div>

        {/* Editor widgets list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {widgets.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>No widgets yet. Add some above to start designing!</div>
          ) : (
            widgets.map((widget, index) => (
              <div key={widget.id} style={{ border: "1px solid var(--border-light)", borderRadius: "12px", overflow: "hidden" }}>
                
                {/* Header widget */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", background: "#f8fafc", borderBottom: "1px solid var(--border-light)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "0.85rem", background: "var(--primary-color)", color: "white", padding: "2px 8px", borderRadius: "4px", fontWeight: "700" }}>#{index + 1}</span>
                    <span style={{ fontWeight: "800", fontSize: "0.95rem" }}>{widget.type.toUpperCase()}</span>
                  </div>
                  <button onClick={() => removeWidget(widget.id)} style={{ border: "none", background: "transparent", color: "#ef4444", fontWeight: "700", cursor: "pointer", fontSize: "0.85rem" }}>Delete</button>
                </div>

                {/* Edit fields */}
                <div style={{ padding: "18px" }}>
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", color: "var(--text-muted)", marginBottom: "4px" }}>Widget Title</label>
                    <input 
                      type="text" 
                      value={widget.title} 
                      onChange={(e) => updateWidgetTitle(widget.id, e.target.value)} 
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border-light)", borderRadius: "6px", boxSizing: "border-box" }} 
                    />
                  </div>

                  {/* Edit: Banners Carousel */}
                  {widget.type === "carousel" && (
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", color: "var(--text-muted)", marginBottom: "8px" }}>Banner Image URLs</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                        {(widget.images || []).map((img, idx) => (
                          <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <img src={img} style={{ width: "60px", height: "30px", objectFit: "cover", borderRadius: "4px" }} alt="" />
                            <input 
                              type="text" 
                              value={img} 
                              onChange={(e) => {
                                const nextImgs = [...widget.images];
                                nextImgs[idx] = e.target.value;
                                setWidgets(widgets.map(w => w.id === widget.id ? { ...w, images: nextImgs } : w));
                              }} 
                              style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--border-light)", borderRadius: "6px", fontSize: "0.8rem" }} 
                            />
                            <button onClick={() => removeImageFromCarousel(widget.id, idx)} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "1.2rem", cursor: "pointer" }}>×</button>
                          </div>
                        ))}
                      </div>
                      <button 
                        onClick={() => addImageToCarousel(widget.id, "")} 
                        style={{ border: "1px dashed var(--primary-color)", background: "none", color: "var(--primary-color)", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "0.78rem", fontWeight: "700" }}
                      >
                        + Add Custom Banner Image
                      </button>
                    </div>
                  )}

                  {/* Edit: Featured Products */}
                  {widget.type === "featured" && (
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", color: "var(--text-muted)", marginBottom: "8px" }}>Select products to display</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "150px", overflowY: "auto", border: "1px solid var(--border-light)", padding: "10px", borderRadius: "6px" }}>
                        {myProducts.length === 0 ? (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", width: "100%" }}>Create products in inventory to feature them.</div>
                        ) : (
                          myProducts.map(p => {
                            const isFeatured = (widget.productIds || []).includes(p._id);
                            return (
                              <button
                                key={p._id}
                                onClick={() => toggleProductInFeatured(widget.id, p._id)}
                                style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid " + (isFeatured ? "var(--primary-color)" : "var(--border-light)"), background: isFeatured ? "#eef2ff" : "white", color: isFeatured ? "var(--primary-color)" : "var(--text-main)", fontSize: "0.78rem", fontWeight: "600", cursor: "pointer" }}
                              >
                                {p.name} {isFeatured ? "✓" : ""}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Edit: Text Content */}
                  {widget.type === "text" && (
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", color: "var(--text-muted)", marginBottom: "4px" }}>Markdown / Text Content</label>
                      <textarea
                        rows={4}
                        value={widget.content}
                        onChange={(e) => updateWidgetContent(widget.id, e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border-light)", borderRadius: "6px", boxSizing: "border-box", fontFamily: "monospace", fontSize: "0.85rem" }}
                      />
                    </div>
                  )}

                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel: Live Preview */}
      <div style={{ display: "flex", flexDirection: "column", gap: "15px", position: "sticky", top: "120px" }}>
        <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "800", color: "var(--text-main)" }}>Storefront Live Preview (Shopee simulation)</h4>
        
        {/* Simulator Device Frame */}
        <div style={{ border: "8px solid #0f172a", borderRadius: "24px", overflow: "hidden", background: "#f8fafc", boxShadow: "var(--shadow-lg)", height: "650px", overflowY: "auto" }}>
          
          {/* Header Storefront */}
          <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", padding: "20px", color: "white", display: "flex", gap: "15px", alignItems: "center" }}>
            {shop.logo ? (
              <img src={shop.logo} style={{ width: "48px", height: "48px", borderRadius: "50%", border: "2px solid white", objectFit: "cover" }} alt="" />
            ) : (
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white", display: "flex", justifyContent: "center", alignItems: "center", fontWeight: "bold", border: "2px solid white" }}>
                {shop.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h5 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "800" }}>{shop.name}</h5>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
                <span style={{ fontSize: "0.7rem", background: "#3b82f6", color: "white", padding: "1px 6px", borderRadius: "99px", fontWeight: "700" }}>Shopee Mall</span>
                <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>★ {shop.rating || "5.0"} | {myProducts.length} items</span>
              </div>
            </div>
          </div>

          {/* Navigation Bar */}
          <div style={{ display: "flex", background: "white", borderBottom: "1px solid var(--border-light)", padding: "10px 0" }}>
            <span style={{ flex: 1, textAlign: "center", fontSize: "0.85rem", fontWeight: "800", color: "var(--primary-color)", borderBottom: "2px solid var(--primary-color)", paddingBottom: "5px" }}>Shop Home</span>
            <span style={{ flex: 1, textAlign: "center", fontSize: "0.85rem", fontWeight: "600", color: "var(--text-muted)" }}>All Products</span>
            <span style={{ flex: 1, textAlign: "center", fontSize: "0.85rem", fontWeight: "600", color: "var(--text-muted)" }}>Categories</span>
          </div>

          {/* Simulated widgets list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "15px", padding: "15px" }}>
            {widgets.map(widget => (
              <div key={widget.id} style={{ background: "white", borderRadius: "12px", border: "1px solid var(--border-light)", overflow: "hidden", padding: "15px", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                {widget.title && (
                  <h6 style={{ margin: "0 0 10px 0", fontSize: "0.9rem", fontWeight: "800", color: "var(--text-main)", borderLeft: "3px solid var(--primary-color)", paddingLeft: "8px" }}>
                    {widget.title}
                  </h6>
                )}

                {/* Simulated Carousel */}
                {widget.type === "carousel" && (
                  <div style={{ position: "relative", width: "100%", height: "130px", borderRadius: "8px", overflow: "hidden" }}>
                    {widget.images && widget.images.length > 0 ? (
                      <img src={widget.images[0]} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: "#e2e8f0", display: "flex", justifyContent: "center", alignItems: "center", color: "#94a3b8" }}>No images added</div>
                    )}
                    <div style={{ position: "absolute", bottom: "8px", right: "8px", background: "rgba(0,0,0,0.5)", color: "white", padding: "2px 6px", borderRadius: "10px", fontSize: "0.68rem" }}>1 / {widget.images?.length || 0}</div>
                  </div>
                )}

                {/* Simulated Featured Row */}
                {widget.type === "featured" && (
                  <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "5px" }}>
                    {(!widget.productIds || widget.productIds.length === 0) ? (
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>No products selected to feature.</div>
                    ) : (
                      widget.productIds.map(pid => {
                        const product = myProducts.find(p => p._id === pid);
                        if (!product) return null;
                        return (
                          <div key={pid} style={{ width: "110px", flexShrink: 0, border: "1px solid #f1f5f9", borderRadius: "8px", padding: "6px", textAlign: "center" }}>
                            <div style={{ height: "70px", background: "#f8fafc", borderRadius: "6px", display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "6px" }}>
                              <img src={product.image || "https://picsum.photos/100/100"} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} alt="" />
                            </div>
                            <p style={{ margin: "0 0 2px 0", fontSize: "0.75rem", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-main)" }}>{product.name}</p>
                            <span style={{ fontSize: "0.75rem", fontWeight: "800", color: "var(--primary-color)" }}>${product.price}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Simulated Markdown Text */}
                {widget.type === "text" && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "pre-line", lineHeight: 1.4 }}>
                    {widget.content || "Placeholder content"}
                  </div>
                )}

              </div>
            ))}
          </div>

        </div>
      </div>

    </div>
  );
}
