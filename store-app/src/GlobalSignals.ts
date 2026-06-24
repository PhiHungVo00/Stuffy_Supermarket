import { signal, effect, computed } from "@preact/signals-react";

/**
 * ELITE CROSS-MFE STATE (Signals)
 * 
 * Unlike Zustand/Redux which requires a certain framework integration 
 * or causes top-down re-renders, Signals can be imported and consumed 
 * anywhere in the Micro-frontend tree.
 */

// 1. Core State Signals (with Persistence)
const initialCartCount = typeof window !== 'undefined' && localStorage.getItem('cartCount') 
  ? parseInt(localStorage.getItem('cartCount') || '0', 10) 
  : 0;
const initialUser = typeof window !== 'undefined' && localStorage.getItem('currentUser') 
  ? JSON.parse(localStorage.getItem('currentUser') || 'null') 
  : null;

export const cartCount = signal(initialCartCount);
export const currentUser = signal<any>(initialUser);
export const activeTenant = signal('default_store');
export const isDarkMode = signal(false);

// 2. Computed Values (Reactive logic)
export const isAdmin = computed(() => currentUser.value?.role === 'admin');

// 3. Effects (Side-effects)
effect(() => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('cartCount', cartCount.value.toString());
    localStorage.setItem('currentUser', JSON.stringify(currentUser.value));
  }
  console.log(`[EliteState] [Rocket] Cart changed: ${cartCount.value} items`);
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
