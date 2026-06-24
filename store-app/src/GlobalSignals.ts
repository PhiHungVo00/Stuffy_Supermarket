import { signal, effect, computed } from "@preact/signals-react";

/**
 * ELITE CROSS-MFE STATE (Signals)
 * 
 * Unlike Zustand/Redux which requires a certain framework integration 
 * or causes top-down re-renders, Signals can be imported and consumed 
 * anywhere in the Micro-frontend tree.
 */

// 1. Core State Signals
export const cartCount = signal(0);
export const currentUser = signal<any>(null);
export const activeTenant = signal('default_store');
export const isDarkMode = signal(false);

// 2. Computed Values (Reactive logic)
export const isAdmin = computed(() => currentUser.value?.role === 'admin');

// 3. Effects (Side-effects)
effect(() => {
console.log(`[EliteState] [Rocket] Cart changed: ${cartCount.value} items`);
  // Sync with local storage or broadcast to legacy systems
});

// 4. Action Helpers
export const incrementCart = () => (cartCount.value += 1);
export const updateCartCount = (count: number) => (cartCount.value = count);
export const toggleTheme = () => (isDarkMode.value = !isDarkMode.value);

/**
 * WHY THIS IS ELITE:
 * - Direct reactivity (O(1) update vs React's Virtual DOM diffing overhead).
 * - Framework agnostic: You could consume 'cartCount' in a Vue MFE or Vanilla JS MFE 
 *   while the host is React.
 */
