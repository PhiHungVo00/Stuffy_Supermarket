/**
 * ELITE MFE PRELOADER
 * Purpose: Preload remoteEntry.js files for dynamic remotes 
 * based on user intent (Hover, Route anticipation).
 */

const preloadedRemotes = new Set();

export const prefetchRemote = (name, url) => {
  if (preloadedRemotes.has(name)) return;
  
  const script = document.createElement("script");
  script.src = url;
  script.async = true;
  script.onload = () => {
    console.log(`[Prefetch] ✅ Remote "${name}" is now hot and ready for 0ms transition.`);
    preloadedRemotes.add(name);
  };
  
  document.head.appendChild(script);
};

const isLocalDev = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const LOCAL_REGISTRY = {
    store: "http://localhost:3005/remoteEntry.js",
    header: "http://localhost:3001/remoteEntry.js",
    product: "http://localhost:3002/remoteEntry.js",
    cart: "http://localhost:3003/remoteEntry.js",
    admin: "http://localhost:3004/remoteEntry.js",
    profile: "http://localhost:3008/remoteEntry.js",
    marketing: "http://localhost:3009/remoteEntry.js",
    support: "http://localhost:3010/remoteEntry.js",
    design_system: "http://localhost:3006/remoteEntry.js",
    viewer: "http://localhost:3007/remoteEntry.js"
};

const PRODUCTION_REGISTRY = {
    store: "https://stuffy-store-app.onrender.com/remoteEntry.js",
    header: "https://stuffy-header-app.onrender.com/remoteEntry.js",
    product: "https://stuffy-product-app.onrender.com/remoteEntry.js",
    cart: "https://stuffy-cart-app.onrender.com/remoteEntry.js",
    admin: "https://stuffy-admin-app.onrender.com/remoteEntry.js",
    profile: "https://stuffy-profile-app.onrender.com/remoteEntry.js",
    marketing: "https://stuffy-marketing-app.onrender.com/remoteEntry.js",
    support: "https://stuffy-support-app.onrender.com/remoteEntry.js",
    design_system: "https://stuffy-design-system-app.onrender.com/remoteEntry.js",
    viewer: "https://stuffy-3d-viewer-app.onrender.com/remoteEntry.js"
};

export const REMOTE_MAP = isLocalDev ? LOCAL_REGISTRY : PRODUCTION_REGISTRY;
