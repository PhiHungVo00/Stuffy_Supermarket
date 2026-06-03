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

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // In development, unregister any active service worker to prevent infinite reload loops
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.unregister();
          console.log('[PWA] Dev mode: Unregistered active service worker to prevent reload loop');
        }
      });
    } else {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
        .catch(err => console.error('[PWA] SW registration failed:', err));
    }
  });
}