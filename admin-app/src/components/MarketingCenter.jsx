import React, { useState, useEffect } from "react";

const MarketingCenter = ({ apiBase, getToken, products }) => {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [subTab, setSubTab] = useState("campaigns"); // "campaigns" or "vouchers"
  const [vouchers, setVouchers] = useState([]);
  const [vouchersLoading, setVouchersLoading] = useState(true);

  // Voucher Form State
  const [vCode, setVCode] = useState("");
  const [vType, setVType] = useState("discount");
  const [vDiscountType, setVDiscountType] = useState("percentage");
  const [vDiscountValue, setVDiscountValue] = useState("");
  const [vDescription, setVDescription] = useState("");
  const [vMinOrderValue, setVMinOrderValue] = useState("");
  const [vMaxDiscount, setVMaxDiscount] = useState("");
  const [vUsageLimit, setVUsageLimit] = useState("100");
  const [vExpiresAt, setVExpiresAt] = useState("");
  const [vIsLivestreamExclusive, setVIsLivestreamExclusive] = useState(false);

  // Create Form State
  const [name, setName] = useState("");
  const [type, setType] = useState("bundle_deal");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  
  // Bundle Deal fields
  const [minQuantity, setMinQuantity] = useState(2);
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState(10);

  // Add-on Deal fields
  const [primaryProductId, setPrimaryProductId] = useState("");
  const [addonItems, setAddonItems] = useState([]); // Array of { product, addonPrice }

  const fetchPromotions = () => {
    setLoading(true);
    fetch(`${apiBase}/api/promotions`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    })
      .then(res => res.json())
      .then(data => {
        setPromotions(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching promotions:", err);
        setLoading(false);
      });
  };

  const fetchVouchers = () => {
    setVouchersLoading(true);
    fetch(`${apiBase}/api/vouchers/mine`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    })
      .then(res => res.json())
      .then(data => {
        setVouchers(Array.isArray(data) ? data : []);
        setVouchersLoading(false);
      })
      .catch(err => {
        console.error("Error fetching vouchers:", err);
        setVouchersLoading(false);
      });
  };

  useEffect(() => {
    fetchPromotions();
    fetchVouchers();
    // Default primary product
    if (products && products.length > 0) {
      setPrimaryProductId(products[0].id || products[0]._id);
    }
  }, [products]);

  const handleCreateVoucher = async (e) => {
    e.preventDefault();
    setMsg("");
    setErrorMsg("");

    if (!vCode || !vType || !vDiscountType || !vDiscountValue || !vDescription || !vExpiresAt) {
      setErrorMsg("Please fill in code, type, discountType, discountValue, description, and expiry date.");
      return;
    }

    const payload = {
      code: vCode.toUpperCase(),
      type: vType,
      discountType: vDiscountType,
      discountValue: Number(vDiscountValue),
      description: vDescription,
      minOrderValue: vMinOrderValue ? Number(vMinOrderValue) : 0,
      maxDiscount: vMaxDiscount ? Number(vMaxDiscount) : 0,
      usageLimit: vUsageLimit ? Number(vUsageLimit) : 100,
      expiresAt: new Date(vExpiresAt).toISOString(),
      isLivestreamExclusive: vIsLivestreamExclusive
    };

    try {
      const res = await fetch(`${apiBase}/api/vouchers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setMsg("Voucher created successfully!");
        setVCode("");
        setVDiscountValue("");
        setVDescription("");
        setVMinOrderValue("");
        setVMaxDiscount("");
        setVUsageLimit("100");
        setVExpiresAt("");
        setVIsLivestreamExclusive(false);
        fetchVouchers();
      } else {
        setErrorMsg(data.error || "Failed to create voucher");
      }
    } catch (err) {
      setErrorMsg("Network error: " + err.message);
    }
  };

  const handleDeleteVoucher = async (id) => {
    if (!window.confirm("Are you sure you want to delete this voucher?")) return;
    try {
      const res = await fetch(`${apiBase}/api/vouchers/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${getToken()}` }
      });
      if (res.ok) {
        setMsg("Voucher deleted.");
        fetchVouchers();
      } else {
        const data = await res.json();
        setErrorMsg(data.error || "Failed to delete voucher");
      }
    } catch (err) {
      setErrorMsg("Error: " + err.message);
    }
  };

  const handleToggleVoucherStatus = async (voucher) => {
    const nextStatus = !voucher.isActive;
    try {
      const res = await fetch(`${apiBase}/api/vouchers/${voucher._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getToken()}`
        },
        body: JSON.stringify({ isActive: nextStatus })
      });
      if (res.ok) {
        fetchVouchers();
      }
    } catch (err) {}
  };

  const handleAddAddonItem = (productId) => {
    if (!productId) return;
    if (addonItems.some(item => item.product === productId)) return;
    setAddonItems([...addonItems, { product: productId, addonPrice: 0 }]);
  };

  const handleRemoveAddonItem = (productId) => {
    setAddonItems(addonItems.filter(item => item.product !== productId));
  };

  const handleAddonPriceChange = (productId, val) => {
    setAddonItems(
      addonItems.map(item =>
        item.product === productId ? { ...item, addonPrice: Number(val) } : item
      )
    );
  };

  const handleCreatePromo = async (e) => {
    e.preventDefault();
    setMsg("");
    setErrorMsg("");

    if (!name || !startsAt || !endsAt) {
      setErrorMsg("Please fill in name, startsAt, and endsAt");
      return;
    }

    const payload = {
      name,
      type,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString()
    };

    if (type === "bundle_deal") {
      payload.minQuantity = Number(minQuantity);
      payload.discountType = discountType;
      payload.discountValue = Number(discountValue);
    } else if (type === "flash_sale") {
      if (!primaryProductId) {
        setErrorMsg("Please select a product for the Flash Sale");
        return;
      }
      payload.primaryProductId = primaryProductId;
      payload.discountType = discountType;
      payload.discountValue = Number(discountValue);
    } else {
      if (!primaryProductId) {
        setErrorMsg("Please select a primary product for the Add-on deal");
        return;
      }
      if (addonItems.length === 0) {
        setErrorMsg("Please select at least one add-on accessory product");
        return;
      }
      payload.primaryProductId = primaryProductId;
      payload.addonProducts = addonItems;
    }

    try {
      const res = await fetch(`${apiBase}/api/promotions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setMsg("Promotion created successfully!");
        setName("");
        setAddonItems([]);
        fetchPromotions();
      } else {
        setErrorMsg(data.error || "Failed to create promotion");
      }
    } catch (err) {
      setErrorMsg("Network error: " + err.message);
    }
  };

  const handleDeletePromo = async (id) => {
    if (!window.confirm("Are you sure you want to delete this promotion?")) return;
    try {
      const res = await fetch(`${apiBase}/api/promotions/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${getToken()}` }
      });
      if (res.ok) {
        setMsg("Promotion deleted.");
        fetchPromotions();
      } else {
        const data = await res.json();
        setErrorMsg(data.error || "Failed to delete");
      }
    } catch (err) {
      setErrorMsg("Error: " + err.message);
    }
  };

  const handleToggleStatus = async (promo) => {
    const nextStatus = promo.status === "active" ? "inactive" : "active";
    try {
      const res = await fetch(`${apiBase}/api/promotions/${promo._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getToken()}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        fetchPromotions();
      }
    } catch (err) {}
  };

  const getProductName = (id) => {
    const p = products.find(prod => (prod.id || prod._id) === id);
    return p ? p.name : id;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Sub tabs navigation */}
      <div style={{ display: "flex", gap: "10px", borderBottom: "1px solid var(--border-light)", paddingBottom: "15px" }}>
        <button
          onClick={() => {
            setSubTab("campaigns");
            setMsg("");
            setErrorMsg("");
          }}
          style={{
            padding: "10px 24px",
            borderRadius: "8px",
            border: "none",
            background: subTab === "campaigns" ? "var(--primary-color)" : "#f1f5f9",
            color: subTab === "campaigns" ? "white" : "var(--text-main)",
            fontWeight: "700",
            cursor: "pointer",
            fontSize: "0.9rem"
          }}
        >
          🎯 Campaigns (Bundle/Flash Sale)
        </button>
        <button
          onClick={() => {
            setSubTab("vouchers");
            setMsg("");
            setErrorMsg("");
          }}
          style={{
            padding: "10px 24px",
            borderRadius: "8px",
            border: "none",
            background: subTab === "vouchers" ? "var(--primary-color)" : "#f1f5f9",
            color: subTab === "vouchers" ? "white" : "var(--text-main)",
            fontWeight: "700",
            cursor: "pointer",
            fontSize: "0.9rem"
          }}
        >
          🎫 Shop Vouchers
        </button>
      </div>

      {subTab === "campaigns" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "30px", alignItems: "start" }}>
      {/* Create Promotion Form */}
      <div className="ds-glass-card" style={{ padding: "30px" }}>
        <h3 style={{ margin: "0 0 20px 0", color: "var(--text-main)", fontWeight: "800" }}>Create New Promotion</h3>

        {msg && <div style={{ color: "#16a34a", padding: "10px", background: "#f0fdf4", borderRadius: "8px", fontWeight: "bold", fontSize: "0.85rem", marginBottom: "15px" }}>{msg}</div>}
        {errorMsg && <div style={{ color: "#ef4444", padding: "10px", background: "#fef2f2", borderRadius: "8px", fontWeight: "bold", fontSize: "0.85rem", marginBottom: "15px" }}>{errorMsg}</div>}

        <form onSubmit={handleCreatePromo} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          <div>
            <label htmlFor="promo-name" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Promotion Name</label>
            <input id="promo-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekend Flash Deal" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} required />
          </div>

          <div>
            <label htmlFor="promo-type" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Promotion Type</label>
            <select id="promo-type" value={type} onChange={e => setType(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
              <option value="bundle_deal">Bundle Deal (Buy X Get Y% Off)</option>
              <option value="addon_deal">Add-on Deal (Add accessory at discount)</option>
              <option value="flash_sale">Flash Sale / Limited-time Pricing Campaign</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label htmlFor="promo-starts" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Starts At</label>
              <input id="promo-starts" type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} required />
            </div>
            <div>
              <label htmlFor="promo-ends" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Ends At</label>
              <input id="promo-ends" type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} required />
            </div>
          </div>

          {/* Type Conditional Fields */}
          {type === "bundle_deal" && (
            <div style={{ padding: "15px", background: "#f8fafc", borderRadius: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Min Quantity to Trigger</label>
                <input type="number" min="1" value={minQuantity} onChange={e => setMinQuantity(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label htmlFor="v-discount-type" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Discount Type</label>
                  <select value={discountType} onChange={e => setDiscountType(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed_amount">Fixed Amount ($)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Discount Value</label>
                  <input type="number" min="0" value={discountValue} onChange={e => setDiscountValue(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} />
                </div>
              </div>
            </div>
          )}

          {type === "flash_sale" && (
            <div style={{ padding: "15px", background: "#f8fafc", borderRadius: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Select Flash Product</label>
                <select value={primaryProductId} onChange={e => setPrimaryProductId(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                  <option value="">-- Choose product --</option>
                  {products.map(p => (
                    <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Discount Type</label>
                  <select value={discountType} onChange={e => setDiscountType(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed_amount">Fixed Amount ($)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Discount Value</label>
                  <input type="number" min="0" value={discountValue} onChange={e => setDiscountValue(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} />
                </div>
              </div>
            </div>
          )}

          {type === "addon_deal" && (
            <div style={{ padding: "15px", background: "#f8fafc", borderRadius: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Primary Product</label>
                <select value={primaryProductId} onChange={e => setPrimaryProductId(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                  {products.map(p => (
                    <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="addon-select" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Add-on Accessories</label>
                <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                  <select id="addon-select" style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                    <option value="">-- Choose accessory --</option>
                    {products.map(p => (
                      <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const sel = document.getElementById("addon-select");
                      if (sel) handleAddAddonItem(sel.value);
                    }}
                    style={{ padding: "8px 14px", background: "var(--primary-color)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}
                  >
                    Add
                  </button>
                </div>

                {addonItems.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifySpace: "between", gap: "10px", background: "white", padding: "8px", border: "1px solid var(--border-light)", borderRadius: "8px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: "bold", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {getProductName(item.product)}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontSize: "0.8rem" }}>$</span>
                      <input
                        type="number"
                        placeholder="Price"
                        value={item.addonPrice}
                        onChange={e => handleAddonPriceChange(item.product, e.target.value)}
                        style={{ width: "60px", padding: "4px", borderRadius: "4px", border: "1px solid var(--border-light)" }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAddonItem(item.product)}
                      style={{ color: "#ef4444", border: "none", background: "none", cursor: "pointer", fontWeight: "bold" }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="submit" style={{ padding: "12px", background: "var(--primary-color)", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", marginTop: "10px" }}>
            Submit Campaign
          </button>
        </form>
      </div>

      {/* Promotions List */}
      <div className="ds-glass-card" style={{ padding: "30px" }}>
        <h3 style={{ margin: "0 0 20px 0", color: "var(--text-main)", fontWeight: "800" }}>Active Campaigns</h3>

        {loading ? (
          <p>Loading campaigns...</p>
        ) : promotions.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No active promotional campaigns found.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {promotions.map(promo => (
              <div key={promo._id} style={{ background: "#f8fafc", borderRadius: "16px", padding: "20px", border: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ margin: 0, fontWeight: "800", color: "var(--text-main)" }}>{promo.name}</h4>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <button
                      onClick={() => handleToggleStatus(promo)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "99px",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        border: "none",
                        cursor: "pointer",
                        background: promo.status === "active" ? "#d1fae5" : "#fee2e2",
                        color: promo.status === "active" ? "#065f46" : "#991b1b"
                      }}
                    >
                      {promo.status.toUpperCase()}
                    </button>
                    <button
                      onClick={() => handleDeletePromo(promo._id)}
                      style={{ border: "none", background: "none", color: "#ef4444", fontWeight: "bold", cursor: "pointer", fontSize: "0.85rem" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Type: <strong>{promo.type === "bundle_deal" ? "Bundle Deal" : promo.type === "flash_sale" ? "Flash Sale" : "Add-on Deal"}</strong>
                </div>

                {promo.type === "bundle_deal" ? (
                  <div style={{ padding: "10px", background: "white", borderRadius: "8px", fontSize: "0.85rem", border: "1px solid var(--border-light)" }}>
                    Condition: Buy $\ge$ {promo.minQuantity} items $\rightarrow$ Get{" "}
                    <strong>{promo.discountValue}{promo.discountType === "percentage" ? "%" : "$"} Off</strong>
                  </div>
                ) : promo.type === "flash_sale" ? (
                  <div style={{ padding: "10px", background: "white", borderRadius: "8px", fontSize: "0.85rem", border: "1px solid var(--border-light)" }}>
                    Product: <strong>{getProductName(promo.primaryProductId)}</strong>
                    <div style={{ marginTop: "6px" }}>
                      Discount: <strong>{promo.discountValue}{promo.discountType === "percentage" ? "%" : "$"} Off</strong>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "10px", background: "white", borderRadius: "8px", fontSize: "0.85rem", border: "1px solid var(--border-light)" }}>
                    Primary: <strong>{getProductName(promo.primaryProductId)}</strong>
                    <div style={{ marginTop: "6px" }}>
                      Add-on items:
                      <ul style={{ margin: "4px 0 0 0", paddingLeft: "20px" }}>
                        {promo.addonProducts?.map((ap, idx) => (
                          <li key={idx}>
                            {getProductName(ap.product)} for <strong>${ap.addonPrice}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  Validity: {new Date(promo.startsAt).toLocaleString()} to {new Date(promo.endsAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "30px", alignItems: "start" }}>
          
          {/* Create Voucher Form */}
          <div className="ds-glass-card" style={{ padding: "30px" }}>
            <h3 style={{ margin: "0 0 20px 0", color: "var(--text-main)", fontWeight: "800" }}>Create New Voucher</h3>

            {msg && <div style={{ color: "#16a34a", padding: "10px", background: "#f0fdf4", borderRadius: "8px", fontWeight: "bold", fontSize: "0.85rem", marginBottom: "15px" }}>{msg}</div>}
            {errorMsg && <div style={{ color: "#ef4444", padding: "10px", background: "#fef2f2", borderRadius: "8px", fontWeight: "bold", fontSize: "0.85rem", marginBottom: "15px" }}>{errorMsg}</div>}

            <form onSubmit={handleCreateVoucher} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <div>
                <label htmlFor="v-code" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Voucher Code</label>
                <input id="v-code" type="text" value={vCode} onChange={e => setVCode(e.target.value.toUpperCase())} placeholder="e.g. SHOP50" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} required />
              </div>

              <div>
                <label htmlFor="v-type" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Voucher Type</label>
                <select id="v-type" value={vType} onChange={e => setVType(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                  <option value="discount">Discount Voucher (Giảm giá)</option>
                  <option value="shipping">Free Shipping Voucher (Mã vận chuyển)</option>
                  <option value="cashback">Stuffy Coins Cashback (Hoàn xu)</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Discount Type</label>
                  <select id="v-discount-type" value={vDiscountType} onChange={e => setVDiscountType(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Discount Value</label>
                  <input 
                    type="number" 
                    min="0.1" 
                    step="any"
                    value={vDiscountValue} 
                    onChange={e => setVDiscountValue(e.target.value)} 
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} 
                    required 
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Description</label>
                <input 
                  type="text" 
                  value={vDescription} 
                  onChange={e => setVDescription(e.target.value)} 
                  placeholder="e.g. Save $10 on minimum purchase of $50" 
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} 
                  required 
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Min Order Value ($)</label>
                  <input 
                    type="number" 
                    min="0" 
                    value={vMinOrderValue} 
                    onChange={e => setVMinOrderValue(e.target.value)} 
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} 
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Max Discount ($)</label>
                  <input 
                    type="number" 
                    min="0" 
                    value={vMaxDiscount} 
                    onChange={e => setVMaxDiscount(e.target.value)} 
                    placeholder="0 for unlimited"
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} 
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Usage Limit</label>
                  <input 
                    type="number" 
                    min="1" 
                    value={vUsageLimit} 
                    onChange={e => setVUsageLimit(e.target.value)} 
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} 
                    required 
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "0.85rem" }}>Expiry Date</label>
                  <input 
                    type="datetime-local" 
                    value={vExpiresAt} 
                    onChange={e => setVExpiresAt(e.target.value)} 
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-light)", boxSizing: "border-box" }} 
                    required 
                  />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "5px" }}>
                <input 
                  type="checkbox" 
                  id="vIsLivestreamExclusive"
                  checked={vIsLivestreamExclusive}
                  onChange={e => setVIsLivestreamExclusive(e.target.checked)}
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                <label htmlFor="vIsLivestreamExclusive" style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-main)", cursor: "pointer" }}>
                  Chỉ áp dụng trên Livestream (Livestream Exclusive)
                </label>
              </div>

              <button type="submit" style={{ padding: "12px", background: "var(--primary-color)", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", marginTop: "10px" }}>
                Submit Voucher
              </button>
            </form>
          </div>

          {/* Vouchers List */}
          <div className="ds-glass-card" style={{ padding: "30px" }}>
            <h3 style={{ margin: "0 0 20px 0", color: "var(--text-main)", fontWeight: "800" }}>Active Shop Vouchers</h3>

            {vouchersLoading ? (
              <p>Loading vouchers...</p>
            ) : vouchers.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No vouchers found for this shop.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                {vouchers.map(voucher => (
                  <div key={voucher._id} style={{ background: "#f8fafc", borderRadius: "16px", padding: "20px", border: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h4 style={{ margin: 0, fontWeight: "900", color: "#1e1b4b", fontSize: "1.15rem", letterSpacing: "0.02em" }}>
                        🎟️ {voucher.code}
                      </h4>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <button
                          onClick={() => handleToggleVoucherStatus(voucher)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: "99px",
                            fontSize: "0.75rem",
                            fontWeight: "bold",
                            border: "none",
                            cursor: "pointer",
                            background: voucher.isActive ? "#d1fae5" : "#fee2e2",
                            color: voucher.isActive ? "#065f46" : "#991b1b"
                          }}
                        >
                          {voucher.isActive ? "ACTIVE" : "INACTIVE"}
                        </button>
                        <button
                          onClick={() => handleDeleteVoucher(voucher._id)}
                          style={{ border: "none", background: "none", color: "#ef4444", fontWeight: "bold", cursor: "pointer", fontSize: "0.85rem" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: "0.85rem", color: "var(--text-main)", fontWeight: "600" }}>
                      {voucher.description}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", background: "white", padding: "10px", borderRadius: "8px", fontSize: "0.8rem", border: "1px solid var(--border-light)" }}>
                      <div>
                        Loại: <strong>{voucher.type === "discount" ? "Giảm giá sản phẩm" : voucher.type === "shipping" ? "Mã vận chuyển" : "Hoàn xu"}</strong>
                      </div>
                      <div>
                        Giảm: <strong>{voucher.discountValue}{voucher.discountType === "percentage" ? "%" : "$"}</strong>
                      </div>
                      <div>
                        Đã dùng: <strong>{voucher.usedCount || 0} / {voucher.usageLimit} lượt</strong>
                      </div>
                      <div>
                        Đơn tối thiểu: <strong>${voucher.minOrderValue || 0}</strong>
                      </div>
                      {voucher.isLivestreamExclusive && (
                        <div style={{ gridColumn: "1/-1", color: "#ea580c", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px" }}>
                          ⚡ Chỉ dùng trên Livestream
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Hết hạn: {new Date(voucher.expiresAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};

export default MarketingCenter;
