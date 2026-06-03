import React, { useState, useEffect } from "react";

const FulfillmentManager = ({ apiBase, getToken }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const fetchOrders = () => {
    setLoading(true);
    fetch(`${apiBase}/api/orders`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    })
      .then(res => res.json())
      .then(data => {
        // Filter orders that need logistics fulfillment (Pending, Processing, Shipped)
        const logisticsOrders = (data.orders || []).filter(o => 
          o.status === "Pending" || o.status === "Processing" || o.status === "Shipped"
        );
        setOrders(logisticsOrders);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleArrangeShipment = async (orderId) => {
    setMsg("");
    setErrorMsg("");
    try {
      const res = await fetch(`${apiBase}/api/shipping/fulfill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getToken()}`
        },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (res.ok) {
        setMsg("Shipment arranged successfully! Label generated.");
        fetchOrders();
      } else {
        setErrorMsg(data.error || "Failed to arrange shipment");
      }
    } catch (err) {
      setErrorMsg("Error: " + err.message);
    }
  };

  const handleSimulateWebhook = async (trackingNumber, carrierStatus, location) => {
    setMsg("");
    setErrorMsg("");
    try {
      const res = await fetch(`${apiBase}/api/shipping/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ trackingNumber, carrierStatus, location })
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`Simulated webhook: ${carrierStatus} updated successfully!`);
        fetchOrders();
      } else {
        setErrorMsg(data.error || "Failed to simulate webhook");
      }
    } catch (err) {
      setErrorMsg("Error: " + err.message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h2 style={{ margin: "0 0 4px 0", fontSize: "1.5rem", fontWeight: "800", color: "var(--text-main)" }}>Logistics & Fulfillment Center</h2>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>Arrange carrier pickups, print shipping labels, and track shipments.</p>
      </div>

      {msg && <div style={{ color: "#16a34a", padding: "12px", background: "#f0fdf4", borderRadius: "10px", fontWeight: "bold", fontSize: "0.88rem" }}>{msg}</div>}
      {errorMsg && <div style={{ color: "#ef4444", padding: "12px", background: "#fef2f2", borderRadius: "10px", fontWeight: "bold", fontSize: "0.88rem" }}>{errorMsg}</div>}

      {loading ? (
        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px" }}>Loading shipments data...</p>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", background: "#f8fafc", borderRadius: "20px", border: "2px dashed var(--border-light)" }}>
          <p style={{ color: "var(--text-muted)", margin: 0 }}>No orders currently require fulfillment.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {orders.map(order => (
            <div key={order._id} style={{ background: "white", borderRadius: "16px", padding: "25px", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "15px", borderBottom: "1px solid #f1f5f9", paddingBottom: "15px" }}>
                <div>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "700" }}>Order ID: #{order._id.slice(-8).toUpperCase()}</span>
                  <h4 style={{ margin: "5px 0 0 0", fontSize: "1.1rem", fontWeight: "800", color: "var(--text-main)" }}>{order.user?.name || "Customer"}</h4>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "4px" }}>
                    Ship to: {order.shippingAddress.address}, {order.shippingAddress.city}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{
                    padding: "4px 12px",
                    borderRadius: "20px",
                    fontSize: "0.8rem",
                    fontWeight: "700",
                    background: order.status === "Pending" ? "#fef3c7" : (order.status === "Processing" ? "#dbeafe" : "#f3e8ff"),
                    color: order.status === "Pending" ? "#d97706" : (order.status === "Processing" ? "#2563eb" : "#7c3aed")
                  }}>
                    {order.status}
                  </span>
                  <div style={{ marginTop: "8px", fontWeight: "800", color: "var(--primary-color)", fontSize: "1.1rem" }}>
                    ${order.totalPrice?.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Items Summary */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "15px" }}>
                {order.orderItems?.map((item, idx) => (
                  <span key={idx} style={{ background: "#f1f5f9", padding: "4px 10px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: "600", color: "var(--text-muted)" }}>
                    {item.name} x{item.qty}
                  </span>
                ))}
              </div>

              {/* Tracking Details & Actions */}
              {order.status === "Pending" ? (
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Carrier: <strong>{(order.shippingCarrier || "GHN").toUpperCase()}</strong></span>
                  <button
                    onClick={() => handleArrangeShipment(order._id)}
                    style={{ padding: "8px 16px", background: "var(--primary-color)", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "0.85rem" }}
                  >
                    Arrange Pickup (Fulfill)
                  </button>
                </div>
              ) : (
                <div style={{ background: "#f8fafc", padding: "15px", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Tracking Number:</span>
                      <div style={{ fontSize: "0.95rem", fontWeight: "700", color: "var(--text-main)", marginTop: "2px" }}>{order.trackingNumber}</div>
                    </div>
                    <a
                      href={order.shippingLabelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ padding: "6px 14px", background: "white", border: "1px solid var(--border-light)", color: "var(--text-main)", borderRadius: "6px", fontSize: "0.8rem", fontWeight: "700", textDecoration: "none", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}
                    >
                      📄 Print Shipping Label
                    </a>
                  </div>

                  {/* Webhook Simulator */}
                  <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: "800", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>3PL Webhook Simulator</span>
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                      <button
                        onClick={() => handleSimulateWebhook(order.trackingNumber, "PICKED_UP", "Local Post Office")}
                        style={{ padding: "6px 12px", borderRadius: "6px", background: "white", border: "1px solid #cbd5e1", fontSize: "0.8rem", cursor: "pointer", fontWeight: "600" }}
                      >
                        🚚 Picked Up
                      </button>
                      <button
                        onClick={() => handleSimulateWebhook(order.trackingNumber, "IN_TRANSIT", "Central Sorting Center")}
                        style={{ padding: "6px 12px", borderRadius: "6px", background: "white", border: "1px solid #cbd5e1", fontSize: "0.8rem", cursor: "pointer", fontWeight: "600" }}
                      >
                        ⚡ In Transit
                      </button>
                      <button
                        onClick={() => handleSimulateWebhook(order.trackingNumber, "DELIVERED", "Recipient Front Door")}
                        style={{ padding: "6px 12px", borderRadius: "6px", background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", fontSize: "0.8rem", cursor: "pointer", fontWeight: "700" }}
                      >
                        ✓ Delivered (Payout)
                      </button>
                    </div>
                  </div>

                  {/* Shipping Logs */}
                  {order.shippingHistory && order.shippingHistory.length > 0 && (
                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: "800", color: "#64748b", textTransform: "uppercase" }}>Tracking History Logs</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                        {order.shippingHistory.map((log, i) => (
                          <div key={i} style={{ fontSize: "0.8rem", display: "flex", justifyContent: "space-between", color: "#475569" }}>
                            <span>📍 [{log.status}] - {log.location}</span>
                            <span style={{ color: "#94a3b8" }}>{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FulfillmentManager;
