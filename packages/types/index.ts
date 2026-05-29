export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  images?: string[];
  description?: string;
  category: string;
  rating?: number;
  numReviews?: number;
  countInStock?: number;
  reviews?: Review[];
  variants?: ProductVariant[];
  tenantId?: string;
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
  phone?: string;
  avatar?: string;
  isSeller?: boolean;
  shopId?: string;
  isVerified?: boolean;
}

export interface CartItem extends Product {
  quantity: number;
  variantId?: string;
  variantSku?: string;
  variantPrice?: number;
  variantAttributes?: Record<string, string>;
}

export interface CartStore {
  items: CartItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
}

export interface Address {
  _id?: string;
  user: string;
  label: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

export interface ShippingAddress {
  address: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface OrderItem {
  name: string;
  qty: number;
  image: string;
  price: number;
  product: string;
  variantId?: string;
  variantSku?: string;
}

export interface Order {
  _id?: string;
  user: string;
  orderItems: OrderItem[];
  shippingAddress: ShippingAddress;
  itemsPrice: number;
  taxPrice: number;
  totalPrice: number;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Canceled';
  paymentMethod: string;
  isPaid: boolean;
  voucherCode?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Voucher {
  _id?: string;
  code: string;
  type: 'shipping' | 'discount' | 'cashback';
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  description: string;
  minOrderValue: number;
  maxDiscount: number;
  usageLimit: number;
  usedCount: number;
  expiresAt: string;
  isActive: boolean;
  tenantId: string;
}

export interface Category {
  _id?: string;
  name: string;
  slug: string;
  parent?: string | null;
  image?: string;
  level: number;
  children?: Category[];
  tenantId?: string;
}

export interface ProductVariant {
  _id?: string;
  product: string;
  sku: string;
  attributes: {
    size?: string;
    color?: string;
    storage?: string;
    [key: string]: string | undefined;
  };
  price: number;
  countInStock: number;
  image?: string;
}

export interface FlashSale {
  _id?: string;
  product: string;
  originalPrice: number;
  flashPrice: number;
  startAt: string;
  endAt: string;
  isActive: boolean;
  tenantId: string;
}

export interface Seller {
  _id?: string;
  userId: string;
  shopName: string;
  slug: string;
  description?: string;
  logo?: string;
  banner?: string;
  rating: number;
  followerCount: number;
  productCount: number;
  isVerified: boolean;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Shop {
  _id?: string;
  ownerId: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  banner?: string;
  rating: number;
  followerCount: number;
  productCount: number;
  isVerified: boolean;
  status: 'active' | 'suspended' | 'pending';
}

export interface ChatMessage {
  _id?: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'product';
  readBy: string[];
  createdAt: string;
}

export interface Notification {
  _id?: string;
  userId: string;
  type: 'order' | 'promotion' | 'system' | 'chat';
  title: string;
  message: string;
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export interface PaymentMethod {
  id: string;
  type: 'credit_card' | 'cod' | 'e_wallet' | 'bank_transfer';
  label: string;
  icon?: string;
  provider?: string;
}
