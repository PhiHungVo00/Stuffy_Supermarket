/**
 * MFE ORCHESTRATOR & DYNAMIC REGISTRY LOADER
 * Objective: Load remotes at Runtime based on the Governance Manifest.
 */

const isLocalDev = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// Local dev server ports matching each MFE's webpack.config.js devServer.port
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

// Fallback static registry (used only if both config.json and backend manifest fail)
const PRODUCTION_REGISTRY = {
    store: "https://stuffy-store-app-xmln.onrender.com/remoteEntry.js",
    header: "https://stuffy-header-app-xmln.onrender.com/remoteEntry.js",
    product: "https://stuffy-product-app-xmln.onrender.com/remoteEntry.js",
    cart: "https://stuffy-cart-app-xmln.onrender.com/remoteEntry.js",
    admin: "https://stuffy-admin-app-xmln.onrender.com/remoteEntry.js",
    profile: "https://stuffy-profile-app-xmln.onrender.com/remoteEntry.js",
    marketing: "https://stuffy-marketing-app-xmln.onrender.com/remoteEntry.js",
    support: "https://stuffy-support-app-xmln.onrender.com/remoteEntry.js",
    design_system: "https://stuffy-design-system-app-xmln.onrender.com/remoteEntry.js",
    viewer: "https://stuffy-3d-viewer-app-xmln.onrender.com/remoteEntry.js"
};

// Load runtime config from /config.json (served as static file — editable without rebuild)
const loadRuntimeConfig = async () => {
    try {
        const res = await fetch('/config.json');
        const cfg = await res.json();
        return {
            store: cfg.STORE_URL ? `${cfg.STORE_URL}/remoteEntry.js` : PRODUCTION_REGISTRY.store,
            header: cfg.HEADER_URL ? `${cfg.HEADER_URL}/remoteEntry.js` : PRODUCTION_REGISTRY.header,
            product: cfg.PRODUCT_URL ? `${cfg.PRODUCT_URL}/remoteEntry.js` : PRODUCTION_REGISTRY.product,
            cart: cfg.CART_URL ? `${cfg.CART_URL}/remoteEntry.js` : PRODUCTION_REGISTRY.cart,
            admin: cfg.ADMIN_URL ? `${cfg.ADMIN_URL}/remoteEntry.js` : PRODUCTION_REGISTRY.admin,
            profile: cfg.PROFILE_URL ? `${cfg.PROFILE_URL}/remoteEntry.js` : PRODUCTION_REGISTRY.profile,
            marketing: cfg.MARKETING_URL ? `${cfg.MARKETING_URL}/remoteEntry.js` : PRODUCTION_REGISTRY.marketing,
            support: cfg.SUPPORT_URL ? `${cfg.SUPPORT_URL}/remoteEntry.js` : PRODUCTION_REGISTRY.support,
            design_system: cfg.DESIGN_SYSTEM_URL ? `${cfg.DESIGN_SYSTEM_URL}/remoteEntry.js` : PRODUCTION_REGISTRY.design_system,
            viewer: cfg.VIEWER_URL ? `${cfg.VIEWER_URL}/remoteEntry.js` : PRODUCTION_REGISTRY.viewer,
            _backendUrl: cfg.BACKEND_API_URL || "https://stuffy-backend-api-xmln.onrender.com",
        };
    } catch (e) {
        console.warn('[Orchestrator] Could not load /config.json, using hardcoded registry.');
        return { ...PRODUCTION_REGISTRY, _backendUrl: "https://stuffy-backend-api-xmln.onrender.com" };
    }
};

export const loadMfeManifest = async () => {
    // In local development, always use local dev servers to avoid React version mismatches
    if (isLocalDev) {
        console.log("[Orchestrator] Local dev detected - using local MFE registry");
        return LOCAL_REGISTRY;
    }

    const runtimeConfig = await loadRuntimeConfig();
    const { _backendUrl, ...runtimeRegistry } = runtimeConfig;

    try {
        const res = await fetch(`${_backendUrl}/api/registry/manifest`);
        const manifest = await res.json();
        return { ...runtimeRegistry, ...manifest };
    } catch (err) {
        console.error("[Orchestrator] Failed to fetch MFE Manifest, using fallback registry.", err);
        return runtimeRegistry;
    }
};

/**
 * Injects a remote script into the document if not already present.
 */
export const injectRemoteScript = (name, url) => {
    return new Promise((resolve, reject) => {
        if (window[name]) return resolve(); // Already loaded

        const script = document.createElement("script");
        script.src = url;
        script.type = "text/javascript";
        script.async = true;

        script.onload = () => {
            console.log(`[Orchestrator] MFE '${name}' successfully injected from ${url}`);
            resolve();
        };

        script.onerror = () => {
            console.warn(`[Orchestrator] Failed to load MFE '${name}' from ${url} - skipping`);
            resolve(); // Resolve instead of reject so other MFEs still load
        };

        document.head.appendChild(script);
    });
};
