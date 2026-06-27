import { create } from "zustand";
import { cartApi } from "./api";
import { Product, CartItem } from "@stuffy/types";
import { updateCartCount } from "./GlobalSignals";

interface CartState {
  cartItems: CartItem[];
  loadCartFromServer: () => Promise<void>;
  addToCart: (product: Product, selectedVariant?: any) => void;
  removeFromCart: (id: string) => void;
  increaseQuantity: (id: string) => void;
  decreaseQuantity: (id: string) => void;
  clearCart: () => void;
}

const syncToServer = async (cartItems: CartItem[]) => {
  try {
    await cartApi.syncCart(cartItems);
  } catch (e) {
    console.error("Failed to sync cart", e);
  }
};

/** Sync the cross-MFE cartCount signal with the current total item count */
const syncCartSignal = (items: CartItem[]) => {
  const total = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
  updateCartCount(total);
};

export const useCartStore = create<CartState>((set, get) => ({
  cartItems: [],
  
  loadCartFromServer: async () => {
    try {
      const data = await cartApi.getCart();
      const newItems = (Array.isArray(data) ? data : (data.cartItems || [])) as CartItem[];
      set({ cartItems: newItems });
      syncCartSignal(newItems);
    } catch (e) {
      console.error("Failed to load cart", e);
    }
  },

  addToCart: (product: Product, selectedVariant?: any) => set((state) => {
    const productId = product.id || (product as any)._id;
    const cartItemId = selectedVariant 
      ? `${productId}_${selectedVariant.sku}` 
      : productId;

    const itemPrice = selectedVariant ? selectedVariant.price : product.price;
    const itemImage = (selectedVariant && selectedVariant.image) ? selectedVariant.image : product.image;

    const existing = state.cartItems.find(i => i.id === cartItemId || (i as any).cartItemId === cartItemId);
    let newItems: CartItem[];
    if (existing) {
      newItems = state.cartItems.map(i => 
        (i.id === cartItemId || (i as any).cartItemId === cartItemId)
          ? { ...i, quantity: i.quantity + 1 } 
          : i
      );
    } else {
      const newCartItem = {
        ...product,
        id: cartItemId,
        _id: productId,
        cartItemId,
        price: itemPrice,
        image: itemImage,
        quantity: 1,
        selectedVariant: selectedVariant || null
      } as any;
      newItems = [...state.cartItems, newCartItem];
    }
    syncToServer(newItems);
    syncCartSignal(newItems);
    return { cartItems: newItems };
  }),

  removeFromCart: (id: string) => set((state) => {
    const newItems = state.cartItems.filter(i => i.id !== id);
    syncToServer(newItems);
    syncCartSignal(newItems);
    return { cartItems: newItems };
  }),

  increaseQuantity: (id: string) => set((state) => {
    const newItems = state.cartItems.map(i => i.id === id ? { ...i, quantity: i.quantity + 1 } : i) as CartItem[];
    syncToServer(newItems);
    syncCartSignal(newItems);
    return { cartItems: newItems };
  }),

  decreaseQuantity: (id: string) => set((state) => {
    const newItems = state.cartItems.map(i => i.id === id && i.quantity > 1 ? { ...i, quantity: i.quantity - 1 } : i) as CartItem[];
    syncToServer(newItems);
    syncCartSignal(newItems);
    return { cartItems: newItems };
  }),

  clearCart: () => set((state) => {
    syncToServer([]);
    syncCartSignal([]);
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
    const productId = product.id || (product as any)._id;
    const exists = state.wishlist.find(i => (i.id || (i as any)._id) === productId);
    let newList;
    if (exists) {
      newList = state.wishlist.filter(i => (i.id || (i as any)._id) !== productId);
    } else {
      newList = [...state.wishlist, product];
    }
    localStorage.setItem('stuffy_wishlist', JSON.stringify(newList));
    return { wishlist: newList };
  }),

  isInWishlist: (id: string) => {
    return !!get().wishlist.find(i => (i.id || (i as any)._id) === id);
  }
}));
