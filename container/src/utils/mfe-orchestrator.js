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

export const loadMfeManifest = async () => {
    // In local development, always use local dev servers to avoid React version mismatches
    if (isLocalDev) {
        console.log("[Orchestrator] Local dev detected - using local MFE registry");
        return LOCAL_REGISTRY;
    }

    try {
        const res = await fetch("https://stuffy-backend-api.onrender.com/api/registry/manifest");
        const manifest = await res.json();
        return { ...PRODUCTION_REGISTRY, ...manifest };
    } catch (err) {
        console.error("[Orchestrator] Failed to fetch MFE Manifest, using fallback registry.", err);
        return PRODUCTION_REGISTRY;
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
