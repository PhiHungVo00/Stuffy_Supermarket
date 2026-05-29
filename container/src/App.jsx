import React, { Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ErrorBoundary from "./components/ErrorBoundary";
// Remove synchronous remote import which causes blank screen with dynamic remotes
// import "design_system/styles"; 
import MobileScanner from "./pages/MobileScanner";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Navigate } from "react-router-dom";
import { prefetchRemote, REMOTE_MAP } from "./utils/prefetch";

const Header = React.lazy(() => import("header/Header"));
// ... existing lazy imports ...
const ProductList = React.lazy(() => import("product/ProductList"));
const ProductDetail = React.lazy(() => import("product/ProductDetail"));
const Cart = React.lazy(() => import("cart/Cart"));
const Admin = React.lazy(() => import("admin/App"));
const UserProfile = React.lazy(() => import("profile/UserProfile"));
const FlashSaleBanner = React.lazy(() => import("marketing/FlashSaleBanner"));
const VoucherWallet = React.lazy(() => import("marketing/VoucherWallet"));
const FloatingChat = React.lazy(() => import("support/FloatingChat"));
const WishlistPage = React.lazy(() => import("product/WishlistPage"));

const ProtectedModule = ({ children, moduleName }) => (
  <ErrorBoundary>
    <Suspense fallback={
      <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', opacity: 0.5 }}>
        <h3 style={{ fontWeight: '600', color: 'var(--text-muted)' }}>Loading {moduleName}...</h3>
      </div>
    }>
      {children}
    </Suspense>
  </ErrorBoundary>
);

const Navbar = () => {
  const { user, logout } = useAuth();

  useEffect(() => {
    // 🏦 Pre-warm the Admin panel if user is Admin, as it's a heavy app
    if (user?.role === 'admin') {
      prefetchRemote('admin', REMOTE_MAP.admin);
    }
  }, [user]);

  return (
    <nav style={{ display: 'flex', justifyContent: 'center', gap: '40px', padding: '20px 0 0 0', borderBottom: '1px solid var(--border-light)', background: 'white', position: 'relative' }}>
      <div style={{ display: 'flex', gap: '40px' }}>
        <NavLink to="/" end style={({isActive}) => ({ textDecoration: 'none', fontWeight: isActive ? '800' : '600', color: isActive ? 'var(--primary-color)' : 'var(--text-muted)', borderBottom: isActive ? '3px solid var(--primary-color)' : '3px solid transparent', paddingBottom: '20px', marginBottom: '-1px', transition: 'all 0.2s' })}>
          Products
        </NavLink>
        <NavLink 
          to="/cart" 
          onMouseEnter={() => prefetchRemote('cart', REMOTE_MAP.cart)}
          style={({isActive}) => ({ textDecoration: 'none', fontWeight: isActive ? '800' : '600', color: isActive ? 'var(--primary-color)' : 'var(--text-muted)', borderBottom: isActive ? '3px solid var(--primary-color)' : '3px solid transparent', paddingBottom: '20px', marginBottom: '-1px', transition: 'all 0.2s' })}>
          Cart
        </NavLink>
        <NavLink 
          to="/wishlist" 
          style={({isActive}) => ({ textDecoration: 'none', fontWeight: isActive ? '800' : '600', color: isActive ? '#ec4899' : 'var(--text-muted)', borderBottom: isActive ? '3px solid #ec4899' : '3px solid transparent', paddingBottom: '20px', marginBottom: '-1px', transition: 'all 0.2s' })}>
          Wishlist
        </NavLink>
        {user?.role === 'admin' && (
          <NavLink 
            to="/admin" 
            onMouseEnter={() => prefetchRemote('admin', REMOTE_MAP.admin)}
            style={({isActive}) => ({ textDecoration: 'none', fontWeight: isActive ? '800' : '600', color: isActive ? '#ef4444' : 'var(--text-muted)', borderBottom: isActive ? '3px solid #ef4444' : '3px solid transparent', paddingBottom: '20px', marginBottom: '-1px', transition: 'all 0.2s' })}>
            Admin
          </NavLink>
        )}
      </div>

      <div style={{ position: 'absolute', right: '30px', top: '15px' }}>
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <NavLink to="/profile" onMouseEnter={() => prefetchRemote('profile', REMOTE_MAP.profile)} style={{ textDecoration: 'none', color: 'inherit' }}>
              <span style={{ fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer', padding: '6px 12px', borderRadius: '8px', background: '#f8fafc', transition: 'all 0.2s' }} onMouseOver={e=>e.target.style.background='#f1f5f9'} onMouseOut={e=>e.target.style.background='#f8fafc'}>
                👤 Hi, {user.name}
              </span>
            </NavLink>
            <button onClick={logout} style={{ padding: '6px 12px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Logout</button>
          </div>
        ) : (
          <NavLink to="/login" style={{ padding: '8px 16px', background: 'var(--primary-color)', color: 'white', textDecoration: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Login</NavLink>
        )}
      </div>
    </nav>
  );
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  return user && user.role === 'admin' ? children : <Navigate to="/login" />;
};

export default function App() {
  useEffect(() => {
    const handleToast = (e) => {
      const { message, type = 'success' } = e.detail;
      toast[type](message);
    };
    window.addEventListener('STUFFY_TOAST', handleToast);

    // Nạp styles từ Design System một cách bất đồng bộ để tránh làm treo ứng dụng
    import("design_system/styles").catch(err => console.error("Không thể nạp Design System styles:", err));

    return () => window.removeEventListener('STUFFY_TOAST', handleToast);
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <ProtectedModule moduleName="Header"><Header /></ProtectedModule>
        <Navbar />
        
        <main style={{ padding: '50px 20px', flex: 1, maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <Routes>
            <Route path="/" element={
              <>
                <div style={{ background: 'var(--primary-color)', color: 'white', padding: '40px 60px', borderRadius: 'var(--radius-lg)', marginBottom: '50px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-hover)' }}>
                <div>
                  <span className="ds-badge" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', marginBottom: '12px', display: 'inline-block', fontSize: '0.8rem', letterSpacing: '0.5px' }}>Live · Real-time Sync</span>
                  <h2 style={{ fontSize: '2.6rem', margin: '0 0 12px 0', fontWeight: '800', lineHeight: 1.15 }}>Stuffy<span style={{ color: 'var(--accent-color)' }}> Store</span></h2>
                  <p style={{ margin: 0, opacity: 0.75, fontSize: '1.05rem', maxWidth: '460px', lineHeight: 1.6 }}>A modern commerce platform built on Micro Frontends architecture with real-time data synchronization.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
                  <span style={{ background: 'rgba(255,255,255,0.1)', padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600' }}>9 MFE Modules</span>
                  <span style={{ background: 'rgba(255,255,255,0.1)', padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600' }}>Socket.IO · MongoDB · Docker</span>
                </div>
              </div>
                <ProtectedModule moduleName="Flash Sale"><FlashSaleBanner /></ProtectedModule>
                <div style={{ marginBottom: '40px' }}><ProtectedModule moduleName="Voucher Wallet"><VoucherWallet /></ProtectedModule></div>
                <ProtectedModule moduleName="Products"><ProductList /></ProtectedModule>
              </>
            } />
            <Route path="/product/:id" element={<ProtectedModule moduleName="Product Detail"><ProductDetail /></ProtectedModule>} />
            <Route path="/cart" element={<ProtectedModule moduleName="Cart"><Cart /></ProtectedModule>} />
            <Route path="/wishlist" element={<ProtectedModule moduleName="Wishlist"><WishlistPage /></ProtectedModule>} />
            <Route path="/profile" element={<ProtectedModule moduleName="Profile"><UserProfile /></ProtectedModule>} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<AdminRoute><ProtectedModule moduleName="Admin"><Admin /></ProtectedModule></AdminRoute>} />
            <Route path="/scanner/:sessionCode" element={<MobileScanner />} />
          </Routes>
        </main>
        
        <ProtectedModule moduleName="Support Chat"><FloatingChat /></ProtectedModule>
        <ToastContainer position="bottom-right" theme="colored" autoClose={3000} />
      </div>
    </BrowserRouter>
    </AuthProvider>
  );
}