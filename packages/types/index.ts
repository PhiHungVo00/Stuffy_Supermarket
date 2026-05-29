export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  description?: string;
  category: string;
  rating?: number;
  numReviews?: number;
  countInStock?: number;
  reviews?: Review[];
}

export interface Review {
  _id: string;
  name: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  token?: string;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface CartStore {
  items: CartItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
}
