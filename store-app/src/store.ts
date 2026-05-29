import { create } from "zustand";
import { cartApi } from "./api";
import { Product, CartItem } from "@stuffy/types";

interface VariantInfo {
  variantId?: string;
  variantSku?: string;
  variantPrice?: number;
  variantAttributes?: Record<string, string>;
}

interface CartState {
  cartItems: CartItem[];
  loadCartFromServer: () => Promise<void>;
  addToCart: (product: Product, variant?: VariantInfo) => void;
  removeFromCart: (id: string, variantId?: string) => void;
  increaseQuantity: (id: string, variantId?: string) => void;
  decreaseQuantity: (id: string, variantId?: string) => void;
  clearCart: () => void;
}

const syncToServer = async (cartItems: CartItem[]) => {
  try {
    await cartApi.syncCart(cartItems);
  } catch (e) {
    console.error("Failed to sync cart", e);
  }
};

export const useCartStore = create<CartState>((set, get) => ({
  cartItems: [],
  
  loadCartFromServer: async () => {
    try {
      const data = await cartApi.getCart();
      set({ cartItems: data.cartItems as CartItem[] });
    } catch (e) {
      console.error("Failed to load cart", e);
    }
  },

  addToCart: (product: Product, variant?: VariantInfo) => set((state) => {
    const cartKey = variant?.variantId ? `${product.id}_${variant.variantId}` : product.id;
    const existing = state.cartItems.find(i => {
      const itemKey = i.variantId ? `${i.id}_${i.variantId}` : i.id;
      return itemKey === cartKey;
    });
    let newItems: CartItem[];
    if (existing) {
      newItems = state.cartItems.map(i => {
        const itemKey = i.variantId ? `${i.id}_${i.variantId}` : i.id;
        return itemKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i;
      });
    } else {
      const cartItem: CartItem = {
        ...product,
        quantity: 1,
        ...(variant && {
          variantId: variant.variantId,
          variantSku: variant.variantSku,
          variantPrice: variant.variantPrice,
          variantAttributes: variant.variantAttributes,
        }),
      };
      if (variant?.variantPrice !== undefined) {
        cartItem.price = variant.variantPrice;
      }
      newItems = [...state.cartItems, cartItem];
    }
    syncToServer(newItems);
    return { cartItems: newItems };
  }),

  removeFromCart: (id: string, variantId?: string) => set((state) => {
    const targetKey = variantId ? `${id}_${variantId}` : id;
    const newItems = state.cartItems.filter(i => {
      const itemKey = i.variantId ? `${i.id}_${i.variantId}` : i.id;
      return itemKey !== targetKey;
    });
    syncToServer(newItems);
    return { cartItems: newItems };
  }),

  increaseQuantity: (id: string, variantId?: string) => set((state) => {
    const targetKey = variantId ? `${id}_${variantId}` : id;
    const newItems = state.cartItems.map(i => {
      const itemKey = i.variantId ? `${i.id}_${i.variantId}` : i.id;
      return itemKey === targetKey ? { ...i, quantity: i.quantity + 1 } : i;
    }) as CartItem[];
    syncToServer(newItems);
    return { cartItems: newItems };
  }),

  decreaseQuantity: (id: string, variantId?: string) => set((state) => {
    const targetKey = variantId ? `${id}_${variantId}` : id;
    const newItems = state.cartItems.map(i => {
      const itemKey = i.variantId ? `${i.id}_${i.variantId}` : i.id;
      return itemKey === targetKey && i.quantity > 1 ? { ...i, quantity: i.quantity - 1 } : i;
    }) as CartItem[];
    syncToServer(newItems);
    return { cartItems: newItems };
  }),

  clearCart: () => set((state) => {
    syncToServer([]);
    return { cartItems: [] };
  })
}));

interface WishlistState {
  wishlist: Product[];
  toggleWishlist: (product: Product) => void;
  isInWishlist: (id: string) => boolean;
}

export const useWishlistStore = create<WishlistState>((set, get) => ({
  wishlist: JSON.parse(localStorage.getItem('stuffy_wishlist') || '[]'),
  
  toggleWishlist: (product: Product) => set((state) => {
    const exists = state.wishlist.find(i => i.id === product.id);
    let newList;
    if (exists) {
      newList = state.wishlist.filter(i => i.id !== product.id);
    } else {
      newList = [...state.wishlist, product];
    }
    localStorage.setItem('stuffy_wishlist', JSON.stringify(newList));
    return { wishlist: newList };
  }),

  isInWishlist: (id: string) => {
    return !!get().wishlist.find(i => i.id === id);
  }
}));
