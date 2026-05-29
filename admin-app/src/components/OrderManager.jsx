import React, { useState, useEffect } from "react";

const STATUS_COLORS = {
  Pending: '#f59e0b',
  Processing: '#3b82f6',
  Shipped: '#8b5cf6',
  Delivered: '#10b981',
  Canceled: '#ef4444'
};

const STATUSES = ['All', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Canceled'];

export default function OrderManager({ apiBase, getToken }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchOrders = () => {
    setLoading(true);
    const statusParam = filterStatus !== 'All' ? `&status=${filterStatus}` : '';
    fetch(`${apiBase}/api/orders?page=${page}${statusParam}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    })
      .then(res => res.json())
      .then(data => {
        setOrders(data.orders || []);
        setTotalPages(data.pages || 1);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, [filterStatus, page]);

  const updateStatus = (orderId, newStatus) => {
    fetch(`${apiBase}/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ status: newStatus })
    })
      .then(res => res.json())
      .then(updated => {
        setOrders(orders.map(o => o._id === updated._id ? updated : o));
      });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '1.5rem', fontWeight: '800' }}>Order Management</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>{total} total orders</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => { setFilterStatus(s); setPage(1); }}
            style={{
              padding: '6px 16px',
              borderRadius: '20px',
              border: filterStatus === s ? 'none' : '1px solid var(--border-light)',
              background: filterStatus === s ? (STATUS_COLORS[s] || 'var(--primary-color)') : 'white',
              color: filterStatus === s ? 'white' : 'var(--text-muted)',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading orders...</p>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: '#f8fafc', borderRadius: '16px', border: '2px dashed var(--border-light)' }}>
          <p style={{ color: 'var(--text-muted)' }}>No orders found</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {orders.map(order => (
            <div key={order._id} style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Order #{order._id?.slice(-8).toUpperCase()}</div>
                  <div style={{ fontWeight: '700', fontSize: '1rem' }}>{order.user?.name || 'Unknown'}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{order.user?.email}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--primary-color)' }}>${order.totalPrice?.toFixed(2)}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(order.createdAt).toLocaleDateString()}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {order.orderItems?.map((item, i) => (
                  <span key={i} style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600' }}>
                    {item.name} x{item.qty}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  background: `${STATUS_COLORS[order.status]}15`,
                  color: STATUS_COLORS[order.status]
                }}>
                  {order.status}
                </span>

                <select
                  value={order.status}
                  onChange={(e) => updateStatus(order._id, e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}
                >
                  {STATUSES.filter(s => s !== 'All').map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: page === p ? 'none' : '1px solid var(--border-light)',
                    background: page === p ? 'var(--primary-color)' : 'white',
                    color: page === p ? 'white' : 'var(--text-main)',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
