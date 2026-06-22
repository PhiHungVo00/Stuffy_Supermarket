import { loadMfeManifest, injectRemoteScript } from "./utils/mfe-orchestrator";

// 🚀 GOVERNANCE ORCHESTRATION: Load MFEs at Runtime from Registry
async function orchestrate() {
  console.log("[Orchestrator] Initializing Governance...");
  
  const manifest = await loadMfeManifest();
  const remoteInjections = [];
  
  // 🏦 DYNAMIC REGISTRY: Inject every remote listed in the manifest (Skip the host container)
  for (const [name, url] of Object.entries(manifest)) {
    if (name === 'container') continue; 
    remoteInjections.push(injectRemoteScript(name, url));
  }
  
  await Promise.all(remoteInjections);
  
  console.log("[Orchestrator] All governance rules applied. Bootstrapping app...");
  import("./bootstrap");
}

orchestrate();

// Register Service Worker for PWA and Push Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // 1. Register Push Service Worker (Always active)
    navigator.serviceWorker.register('/push-sw.js')
      .then(reg => console.log('[Push Notification] Push Service Worker registered with scope:', reg.scope))
      .catch(err => console.error('[Push Notification] Push SW registration failed:', err));

    // 2. Register Workbox PWA Service Worker (only in production)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          if (registration.active && registration.active.scriptURL.includes('service-worker.js')) {
            registration.unregister();
            console.log('[PWA] Dev mode: Unregistered active PWA service-worker.js to prevent reload loop');
          }
        }
      });
    } else {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('[PWA] PWA Service Worker registered:', reg.scope))
        .catch(err => console.error('[PWA] PWA SW registration failed:', err));
    }
  });
}