import React, { useState, useEffect } from "react";
import ProductForm from "./components/ProductForm";
import ProductList from "./components/ProductList";
import Dashboard from "./components/Dashboard";
import OrderManager from "./components/OrderManager";
import SellerChat from "./components/SellerChat";
import ShopDecorator from "./components/ShopDecorator";
import MarketingCenter from "./components/MarketingCenter";
import LiveConsole from "./components/LiveConsole";
import FulfillmentManager from "./components/FulfillmentManager";
import SellerWallet from "./components/SellerWallet";
import ReviewManager from "./components/ReviewManager";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api-xmln.onrender.com' : 'http://localhost:5000';

const App = () => {
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [activeTab, setActiveTab] = useState('products');
  
  // User & Shop Profile State
  const [userRole, setUserRole] = useState('admin');
  const [shopId, setShopId] = useState(null);
  const [shopName, setShopName] = useState('');

  const getToken = () => {
    const userInfoString = localStorage.getItem('userInfo');
    if (!userInfoString) return '';
    try { return JSON.parse(userInfoString).token; } catch (e) { return ''; }
  };

  const fetchProducts = (currentShopId, currentRole) => {
    const role = currentRole || userRole;
    const sId = currentShopId || shopId;
    
    // Fetch products. If seller, fetch only their own shop products.
    // We fetch a high limit (pageSize=999) to cover all of them for inventory display
    let url = `${API_BASE}/api/products?pageNumber=1&pageSize=999`;
    if (role === 'seller' && sId) {
      url = `${API_BASE}/api/products?pageNumber=1&pageSize=999&shop=${sId}`;
    }

    fetch(url)
      .then(res => res.json())
      .then(data => setProducts(data.products || []))
      .catch(err => console.error("Error fetching products:", err));
  };

  useEffect(() => {
    const userInfoString = localStorage.getItem('userInfo');
    if (userInfoString) {
      const userInfo = JSON.parse(userInfoString);
      setUserRole(userInfo.role || 'admin');

      if (userInfo.role === 'seller') {
        fetch(`${API_BASE}/api/shops/mine`, {
          headers: { 'Authorization': `Bearer ${userInfo.token}` }
        })
        .then(res => res.json())
        .then(shop => {
          if (shop && !shop.error) {
            setShopId(shop._id);
            setShopName(shop.name);
            fetchProducts(shop._id, 'seller');
          }
        })
        .catch(err => {
          console.error("Error fetching seller shop info:", err);
          fetchProducts(null, 'seller');
        });
      } else {
        fetchProducts(null, userInfo.role || 'admin');
      }
    } else {
      fetchProducts(null, 'admin');
    }
  }, []);

  const addProduct = (product) => {
    fetch(`${API_BASE}/api/products`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${getToken()}` 
      },
      body: JSON.stringify({ 
        name: product.name, 
        price: Number(product.price), 
        description: product.description, 
        category: product.category,
        weight: Number(product.weight || 200),
        shop: shopId // Enforced by backend validation for sellers
      })
    })
    .then(res => res.json())
    .then(() => fetchProducts(shopId, userRole));
  };

  const updateProduct = (updated) => {
    fetch(`${API_BASE}/api/products/${updated.id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${getToken()}` 
      },
      body: JSON.stringify({ 
        name: updated.name, 
        price: Number(updated.price), 
        description: updated.description, 
        category: updated.category,
        weight: Number(updated.weight || 200)
      })
    })
    .then(res => res.json())
    .then(() => {
      fetchProducts(shopId, userRole);
      setEditing(null);
    });
  };

  const deleteProduct = (id) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    fetch(`${API_BASE}/api/products/${id}`, { 
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    })
    .then(() => fetchProducts(shopId, userRole));
  };

  const startEdit = (product) => {
    setEditing(product);
  };

  return (
    <div>
      <div style={{ marginBottom: "30px", borderBottom: '1px solid var(--border-light)', paddingBottom: '20px' }}>
        <h1 style={{ color: "var(--text-main)", margin: "0 0 6px 0", fontSize: '2.2rem', fontWeight: '800' }}>
          {userRole === 'seller' ? 'Seller Center Dashboard' : 'Admin BI Dashboard'}
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.92rem' }}>
          {userRole === 'seller' 
            ? `Manage inventory, track customer orders, and analyze performance for your store: ${shopName || 'Loading shop...'}.`
            : "Analyze business trends, user behavioral funnels and real-time inventory performance across the entire platform."}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
        <button 
          onClick={() => setActiveTab('products')} 
          style={{ 
            padding: '10px 24px', 
            borderRadius: '8px', 
            border: 'none', 
            background: activeTab === 'products' ? 'var(--primary-color)' : '#f1f5f9', 
            color: activeTab === 'products' ? 'white' : 'var(--text-main)', 
            fontWeight: '700', 
            cursor: 'pointer' 
          }}
        >
          Products
        </button>
        <button 
          onClick={() => setActiveTab('orders')} 
          style={{ 
            padding: '10px 24px', 
            borderRadius: '8px', 
            border: 'none', 
            background: activeTab === 'orders' ? 'var(--primary-color)' : '#f1f5f9', 
            color: activeTab === 'orders' ? 'white' : 'var(--text-main)', 
            fontWeight: '700', 
            cursor: 'pointer' 
          }}
        >
          Orders
        </button>
        <button 
          onClick={() => setActiveTab('chat')} 
          style={{ 
            padding: '10px 24px', 
            borderRadius: '8px', 
            border: 'none', 
            background: activeTab === 'chat' ? 'var(--primary-color)' : '#f1f5f9', 
            color: activeTab === 'chat' ? 'white' : 'var(--text-main)', 
            fontWeight: '700', 
            cursor: 'pointer' 
          }}
        >
          Customer Chat
        </button>
        {userRole === 'seller' && (
          <button 
            onClick={() => setActiveTab('decorate')} 
            style={{ 
              padding: '10px 24px', 
              borderRadius: '8px', 
              border: 'none', 
              background: activeTab === 'decorate' ? 'var(--primary-color)' : '#f1f5f9', 
              color: activeTab === 'decorate' ? 'white' : 'var(--text-main)', 
              fontWeight: '700', 
              cursor: 'pointer' 
            }}
          >
            Store Decorator
          </button>
        )}
        {userRole === 'seller' && (
          <button 
            onClick={() => setActiveTab('promotions')} 
            style={{ 
              padding: '10px 24px', 
              borderRadius: '8px', 
              border: 'none', 
              background: activeTab === 'promotions' ? 'var(--primary-color)' : '#f1f5f9', 
              color: activeTab === 'promotions' ? 'white' : 'var(--text-main)', 
              fontWeight: '700', 
              cursor: 'pointer' 
            }}
          >
            Marketing Center
          </button>
        )}
        {userRole === 'seller' && (
          <button 
            onClick={() => setActiveTab('live')} 
            style={{ 
              padding: '10px 24px', 
              borderRadius: '8px', 
              border: 'none', 
              background: activeTab === 'live' ? 'var(--primary-color)' : '#f1f5f9', 
              color: activeTab === 'live' ? 'white' : 'var(--text-main)', 
              fontWeight: '700', 
              cursor: 'pointer' 
            }}
          >
            Live Stream
          </button>
        )}
        {userRole === 'seller' && (
          <button 
            onClick={() => setActiveTab('shipments')} 
            style={{ 
              padding: '10px 24px', 
              borderRadius: '8px', 
              border: 'none', 
              background: activeTab === 'shipments' ? 'var(--primary-color)' : '#f1f5f9', 
              color: activeTab === 'shipments' ? 'white' : 'var(--text-main)', 
              fontWeight: '700', 
              cursor: 'pointer' 
            }}
          >
            Shipments
          </button>
        )}
                {userRole === 'seller' && (
          <button 
            onClick={() => setActiveTab('reviews')} 
            style={{ 
              padding: '10px 24px', 
              borderRadius: '8px', 
              border: 'none', 
              background: activeTab === 'reviews' ? 'var(--primary-color)' : '#f1f5f9', 
              color: activeTab === 'reviews' ? 'white' : 'var(--text-main)', 
              fontWeight: '700', 
              cursor: 'pointer' 
            }}
          >
            Reviews
          </button>
        )}
{userRole === 'seller' && (
          <button 
            onClick={() => setActiveTab('wallet')} 
            style={{ 
              padding: '10px 24px', 
              borderRadius: '8px', 
              border: 'none', 
              background: activeTab === 'wallet' ? 'var(--primary-color)' : '#f1f5f9', 
              color: activeTab === 'wallet' ? 'white' : 'var(--text-main)', 
              fontWeight: '700', 
              cursor: 'pointer' 
            }}
          >
            Seller Wallet
          </button>
        )}
      </div>

      {activeTab === 'products' && (
        <>
          <Dashboard products={products} />
          <div style={{ marginBottom: '30px' }}>
            <h2 style={{ color: "var(--text-main)", fontSize: '1.5rem', fontWeight: '800' }}>
              {userRole === 'seller' ? 'My Shop Inventory' : 'Product Inventory'}
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 350px) 1fr', gap: '30px', alignItems: 'start' }}>
            <ProductForm onAdd={addProduct} onUpdate={updateProduct} editing={editing} />
            <ProductList products={products} onDelete={deleteProduct} onEdit={startEdit} />
          </div>
        </>
      )}

      {activeTab === 'orders' && (
        <OrderManager apiBase={API_BASE} getToken={getToken} />
      )}

      {activeTab === 'chat' && (
        <SellerChat apiBase={API_BASE} getToken={getToken} />
      )}

      {activeTab === 'decorate' && (
        <ShopDecorator apiBase={API_BASE} getToken={getToken} />
      )}

      {activeTab === 'promotions' && (
        <MarketingCenter apiBase={API_BASE} getToken={getToken} products={products} />
      )}

      {activeTab === 'live' && (
        <LiveConsole apiBase={API_BASE} getToken={getToken} products={products} />
      )}

      {activeTab === 'shipments' && (
        <FulfillmentManager apiBase={API_BASE} getToken={getToken} />
      )}

            {activeTab === 'reviews' && (
        <ReviewManager products={products} apiBase={API_BASE} getToken={getToken} onRefresh={() => fetchProducts(shopId, userRole)} />
      )}
{activeTab === 'wallet' && (
        <SellerWallet apiBase={API_BASE} getToken={getToken} />
      )}
    </div>
  );
};

export default App;
