import { create } from "zustand";
import { cartApi } from "./api";
import { Product, CartItem } from "@stuffy/types";

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

export const useCartStore = create<CartState>((set, get) => ({
  cartItems: [],
  
  loadCartFromServer: async () => {
    try {
      const data = await cartApi.getCart();
      set({ cartItems: (Array.isArray(data) ? data : (data.cartItems || [])) as CartItem[] });
    } catch (e) {
      console.error("Failed to load cart", e);
    }
  },

  addToCart: (product: Product, selectedVariant?: any) => set((state) => {
    const cartItemId = selectedVariant 
      ? `${product.id}_${selectedVariant.sku}` 
      : product.id;

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
        cartItemId,
        price: itemPrice,
        image: itemImage,
        quantity: 1,
        selectedVariant: selectedVariant || null
      } as any;
      newItems = [...state.cartItems, newCartItem];
    }
    syncToServer(newItems);
    return { cartItems: newItems };
  }),

  removeFromCart: (id: string) => set((state) => {
    const newItems = state.cartItems.filter(i => i.id !== id);
    syncToServer(newItems);
    return { cartItems: newItems };
  }),

  increaseQuantity: (id: string) => set((state) => {
    const newItems = state.cartItems.map(i => i.id === id ? { ...i, quantity: i.quantity + 1 } : i) as CartItem[];
    syncToServer(newItems);
    return { cartItems: newItems };
  }),

  decreaseQuantity: (id: string) => set((state) => {
    const newItems = state.cartItems.map(i => i.id === id && i.quantity > 1 ? { ...i, quantity: i.quantity - 1 } : i) as CartItem[];
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
