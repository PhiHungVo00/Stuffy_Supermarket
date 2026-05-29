import React, { useState, useEffect } from "react";
import Button from "design_system/Button";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';

const STATUS_STEPS = ['Pending', 'Processing', 'Shipped', 'Delivered'];

const STATUS_COLORS = {
  Pending: '#f59e0b',
  Processing: '#3b82f6',
  Shipped: '#8b5cf6',
  Delivered: '#10b981',
  Canceled: '#ef4444'
};

export default function UserProfile() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("orders");
  const [expandedOrder, setExpandedOrder] = useState(null);
  
  // Settings state
  const [editName, setEditName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [addresses, setAddresses] = useState([]);
  const [addressForm, setAddressForm] = useState({ label: 'Home', address: '', city: '', postalCode: '', country: '', phone: '', isDefault: false });
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [addressMsg, setAddressMsg] = useState('');
  
  const userInfoString = localStorage.getItem('userInfo');
  const user = userInfoString ? JSON.parse(userInfoString) : null;
  const token = user?.token || '';

  useEffect(() => {
    if (user) setEditName(user.name);
  }, []);

  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/api/orders/myorders`, {
        headers: { "Authorization": `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        setOrders(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch orders:", err);
        setLoading(false);
      });

      fetch(`${API_BASE}/api/addresses`, {
        headers: { "Authorization": `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setAddresses(data); })
      .catch(() => {});
    } else {
      setLoading(false);
    }
  }, []);

  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px', background: '#f8fafc', borderRadius: '16px' }}>
        <h2 style={{ color: 'var(--text-main)' }}>Authentication Required</h2>
        <p style={{ color: 'var(--text-muted)' }}>Please log in to view your profile and orders.</p>
      </div>
    );
  }

  const handleUpdateProfile = async () => {
    setSettingsMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: editName })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('userInfo', JSON.stringify(data));
        setSettingsMsg('Profile updated successfully!');
      } else {
        setSettingsMsg(data.error || 'Failed to update profile');
      }
    } catch (e) {
      setSettingsMsg('Network error: ' + e.message);
    }
  };

  const handleChangePassword = async () => {
    setPasswordMsg('');
    if (!currentPassword || !newPassword) {
      setPasswordMsg('Please fill in both fields');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/auth/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordMsg('Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
      } else {
        setPasswordMsg(data.error || 'Failed to change password');
      }
    } catch (e) {
      setPasswordMsg('Network error: ' + e.message);
    }
  };

  const getStatusIndex = (status) => STATUS_STEPS.indexOf(status);

  const renderTimeline = (order) => {
    if (order.status === 'Canceled') {
      return (
        <div style={{ padding: '15px', background: '#fef2f2', borderRadius: '12px', textAlign: 'center', color: '#ef4444', fontWeight: '700' }}>
          Order Canceled
        </div>
      );
    }

    const currentIdx = getStatusIndex(order.status);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0', padding: '20px 0' }}>
        {STATUS_STEPS.map((step, idx) => {
          const isActive = idx <= currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <React.Fragment key={step}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 0 }}>
                <div style={{
                  width: isCurrent ? '36px' : '28px',
                  height: isCurrent ? '36px' : '28px',
                  borderRadius: '50%',
                  background: isActive ? STATUS_COLORS[step] : '#e2e8f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: '800', fontSize: '0.75rem',
                  transition: 'all 0.3s',
                  boxShadow: isCurrent ? `0 0 0 4px ${STATUS_COLORS[step]}30` : 'none'
                }}>
                  {isActive ? (idx < currentIdx ? '✓' : (idx + 1)) : (idx + 1)}
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: isActive ? '700' : '500', color: isActive ? STATUS_COLORS[step] : '#94a3b8', marginTop: '6px', whiteSpace: 'nowrap' }}>
                  {step}
                </span>
              </div>
              {idx < STATUS_STEPS.length - 1 && (
                <div style={{ flex: 1, height: '3px', background: idx < currentIdx ? STATUS_COLORS[STATUS_STEPS[idx + 1]] : '#e2e8f0', minWidth: '40px', marginBottom: '20px', transition: 'background 0.3s' }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const inputStyle = { width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-light)', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ display: 'flex', gap: '40px', minHeight: '600px' }}>
      {/* Sidebar */}
      <aside style={{ width: '250px', flexShrink: 0 }}>
        <div style={{ background: 'white', padding: '30px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.03)', border: '1px solid var(--border-light)', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-color), #8b5cf6)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '2rem', fontWeight: 'bold', margin: '0 auto 15px auto' }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <h3 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', color: 'var(--text-main)' }}>{user.name}</h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{user.email}</p>
          <span style={{ display: 'inline-block', marginTop: '10px', fontSize: '0.75rem', fontWeight: 'bold', background: '#eef2ff', color: 'var(--primary-color)', padding: '4px 10px', borderRadius: '99px', textTransform: 'uppercase' }}>
            {user.role} Member
          </span>
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { key: 'orders', icon: '📦', label: 'Order History' },
            { key: 'addresses', icon: '📍', label: 'Address Book' },
            { key: 'settings', icon: '⚙️', label: 'Account Settings' },
          ].map(tab => (
            <li key={tab.key}>
              <button onClick={() => setActiveTab(tab.key)} style={{ width: '100%', textAlign: 'left', padding: '12px 20px', borderRadius: '12px', background: activeTab === tab.key ? 'var(--primary-color)' : 'transparent', color: activeTab === tab.key ? 'white' : 'var(--text-main)', border: 'none', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {tab.icon} {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main Content */}
      <div style={{ flex: 1 }}>
        {activeTab === 'orders' && (
          <div>
            <h2 style={{ fontSize: '2rem', margin: '0 0 30px 0', fontWeight: '800', color: 'var(--text-main)' }}>My Orders</h2>
            
            {loading ? (
              <p>Loading your orders...</p>
            ) : orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px', background: '#f8fafc', borderRadius: '24px', border: '2px dashed var(--border-light)' }}>
                <span style={{ fontSize: '3rem', opacity: 0.5 }}>🛍️</span>
                <h3 style={{ margin: '15px 0 5px 0', color: 'var(--text-main)' }}>No pending orders</h3>
                <p style={{ color: 'var(--text-muted)' }}>Looks like you haven't made a purchase yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                {orders.map(order => (
                  <div key={order._id} style={{ background: 'white', borderRadius: '24px', padding: '30px', border: '1px solid var(--border-light)', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-light)', paddingBottom: '20px', marginBottom: '20px' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '5px' }}>Order ID</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>#{order._id?.substring(0, 8) || 'N/A'}</div>
                        <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#64748b' }}>Placed on {new Date(order.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: `${STATUS_COLORS[order.status] || '#6366f1'}15`, color: STATUS_COLORS[order.status] || '#6366f1', padding: '6px 12px', borderRadius: '99px', fontWeight: 'bold', fontSize: '0.85rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLORS[order.status] || '#6366f1' }}></span>
                          {order.status || 'Pending'}
                        </div>
                        <div style={{ marginTop: '10px', fontSize: '1.2rem', fontWeight: '800', color: 'var(--primary-color)' }}>
                          ${order.totalPrice?.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Order Timeline */}
                    {renderTimeline(order)}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {(expandedOrder === order._id ? order.orderItems : order.orderItems.slice(0, 2)).map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                          <img src={item.image} alt={item.name} style={{ width: '60px', height: '60px', objectFit: 'contain', background: '#f1f5f9', borderRadius: '10px', padding: '5px' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>{item.name}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Qty: {item.qty}</div>
                          </div>
                          <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>
                            ${(item.price * item.qty).toFixed(2)}
                          </div>
                        </div>
                      ))}
                      {order.orderItems.length > 2 && (
                        <button
                          onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)}
                          style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem', textAlign: 'left', padding: '5px 0' }}
                        >
                          {expandedOrder === order._id ? 'Show less' : `+${order.orderItems.length - 2} more items`}
                        </button>
                      )}
                    </div>

                    {order.shippingAddress && (
                      <div style={{ marginTop: '15px', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <strong>Ship to:</strong> {order.shippingAddress.address}, {order.shippingAddress.city}, {order.shippingAddress.postalCode}, {order.shippingAddress.country}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'addresses' && (
          <div>
            <h2 style={{ fontSize: '2rem', margin: '0 0 30px 0', fontWeight: '800', color: 'var(--text-main)' }}>Address Book</h2>
            
            {addressMsg && (
              <div style={{ padding: '10px 15px', borderRadius: '8px', marginBottom: '15px', background: addressMsg.includes('success') || addressMsg.includes('removed') ? '#f0fdf4' : '#fef2f2', color: addressMsg.includes('success') || addressMsg.includes('removed') ? '#16a34a' : '#ef4444', fontSize: '0.9rem', fontWeight: '600' }}>
                {addressMsg}
              </div>
            )}

            <div style={{ background: 'white', borderRadius: '16px', padding: '25px', border: '1px solid var(--border-light)', marginBottom: '25px' }}>
              <h4 style={{ margin: '0 0 20px 0' }}>{editingAddressId ? 'Edit Address' : 'Add New Address'}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '0.85rem' }}>Label</label>
                  <select value={addressForm.label} onChange={e => setAddressForm({...addressForm, label: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                    <option>Home</option><option>Work</option><option>Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '0.85rem' }}>Phone</label>
                  <input value={addressForm.phone} onChange={e => setAddressForm({...addressForm, phone: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)' }} placeholder="Phone number" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '0.85rem' }}>Street Address</label>
                  <input value={addressForm.address} onChange={e => setAddressForm({...addressForm, address: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)' }} placeholder="123 Main St" required />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '0.85rem' }}>City</label>
                  <input value={addressForm.city} onChange={e => setAddressForm({...addressForm, city: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)' }} placeholder="City" required />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '0.85rem' }}>Postal Code</label>
                  <input value={addressForm.postalCode} onChange={e => setAddressForm({...addressForm, postalCode: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)' }} placeholder="10001" required />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '0.85rem' }}>Country</label>
                  <input value={addressForm.country} onChange={e => setAddressForm({...addressForm, country: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)' }} placeholder="Vietnam" required />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={addressForm.isDefault} onChange={e => setAddressForm({...addressForm, isDefault: e.target.checked})} />
                  <label style={{ fontSize: '0.85rem', fontWeight: '600' }}>Set as default</label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={async () => {
                  setAddressMsg('');
                  try {
                    const url = editingAddressId ? `${API_BASE}/api/addresses/${editingAddressId}` : `${API_BASE}/api/addresses`;
                    const method = editingAddressId ? 'PUT' : 'POST';
                    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(addressForm) });
                    if (res.ok) {
                      setAddressMsg(editingAddressId ? 'Address updated successfully!' : 'Address added successfully!');
                      setAddressForm({ label: 'Home', address: '', city: '', postalCode: '', country: '', phone: '', isDefault: false });
                      setEditingAddressId(null);
                      const addrs = await fetch(`${API_BASE}/api/addresses`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
                      setAddresses(addrs);
                    } else { const d = await res.json(); setAddressMsg(d.error || 'Failed'); }
                  } catch (e) { setAddressMsg('Network error'); }
                }} style={{ padding: '10px 24px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                  {editingAddressId ? 'Update' : 'Add Address'}
                </button>
                {editingAddressId && (
                  <button onClick={() => { setEditingAddressId(null); setAddressForm({ label: 'Home', address: '', city: '', postalCode: '', country: '', phone: '', isDefault: false }); }} style={{ padding: '10px 24px', background: '#f1f5f9', color: 'var(--text-main)', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>Cancel</button>
                )}
              </div>
            </div>

            {addresses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '12px', border: '2px dashed var(--border-light)' }}>
                <p style={{ color: 'var(--text-muted)' }}>No saved addresses yet</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '15px' }}>
                {addresses.map(addr => (
                  <div key={addr._id} style={{ background: 'white', borderRadius: '12px', padding: '20px', border: addr.isDefault ? '2px solid var(--primary-color)' : '1px solid var(--border-light)', position: 'relative' }}>
                    {addr.isDefault && <span style={{ position: 'absolute', top: '10px', right: '10px', background: '#eef2ff', color: 'var(--primary-color)', fontSize: '0.7rem', fontWeight: '800', padding: '3px 8px', borderRadius: '99px' }}>DEFAULT</span>}
                    <div style={{ fontWeight: '700', marginBottom: '6px' }}>{addr.label}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                      {addr.address}, {addr.city}, {addr.postalCode}, {addr.country}
                      {addr.phone && <><br/>Phone: {addr.phone}</>}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                      <button onClick={() => { setEditingAddressId(addr._id); setAddressForm({ label: addr.label, address: addr.address, city: addr.city, postalCode: addr.postalCode, country: addr.country, phone: addr.phone || '', isDefault: addr.isDefault }); }} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'white', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer' }}>Edit</button>
                      <button onClick={async () => {
                        await fetch(`${API_BASE}/api/addresses/${addr._id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                        setAddresses(addresses.filter(a => a._id !== addr._id));
                        setAddressMsg('Address removed');
                      }} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <h2 style={{ fontSize: '2rem', margin: '0 0 30px 0', fontWeight: '800', color: 'var(--text-main)' }}>Account Settings</h2>
            
            {/* Profile Details */}
            <div style={{ background: 'white', borderRadius: '24px', padding: '30px', border: '1px solid var(--border-light)', boxShadow: '0 10px 30px rgba(0,0,0,0.02)', marginBottom: '25px' }}>
              <h4 style={{ margin: '0 0 20px 0' }}>Profile Details</h4>
              {settingsMsg && (
                <div style={{ padding: '10px 15px', borderRadius: '8px', marginBottom: '15px', background: settingsMsg.includes('success') ? '#f0fdf4' : '#fef2f2', color: settingsMsg.includes('success') ? '#16a34a' : '#ef4444', fontSize: '0.9rem', fontWeight: '600' }}>
                  {settingsMsg}
                </div>
              )}
              <div style={{ display: 'grid', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>Full Name</label>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>Email Address</label>
                  <input type="text" value={user.email} disabled style={{ ...inputStyle, background: '#f8fafc', color: 'var(--text-muted)' }} />
                </div>
              </div>
              <button onClick={handleUpdateProfile} style={{ marginTop: '20px', padding: '12px 30px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                Save Changes
              </button>
            </div>

            {/* Change Password */}
            <div style={{ background: 'white', borderRadius: '24px', padding: '30px', border: '1px solid var(--border-light)', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}>
              <h4 style={{ margin: '0 0 20px 0' }}>Change Password</h4>
              {passwordMsg && (
                <div style={{ padding: '10px 15px', borderRadius: '8px', marginBottom: '15px', background: passwordMsg.includes('success') ? '#f0fdf4' : '#fef2f2', color: passwordMsg.includes('success') ? '#16a34a' : '#ef4444', fontSize: '0.9rem', fontWeight: '600' }}>
                  {passwordMsg}
                </div>
              )}
              <div style={{ display: 'grid', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>Current Password</label>
                  <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={inputStyle} placeholder="Enter current password" />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inputStyle} placeholder="Enter new password" />
                </div>
              </div>
              <button onClick={handleChangePassword} style={{ marginTop: '20px', padding: '12px 30px', background: '#f97316', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                Change Password
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
