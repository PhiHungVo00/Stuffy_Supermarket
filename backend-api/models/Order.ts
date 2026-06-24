import mongoose, { Document, Schema } from 'mongoose';

export interface IOrder extends Document {
  user: mongoose.Types.ObjectId;
  shop: mongoose.Types.ObjectId;
  parentOrderId?: string;
  shippingFee: number;
  shippingCarrier?: string;
  orderItems: Array<{
    name: string;
    qty: number;
    image: string;
    price: number;
    product: mongoose.Types.ObjectId;
  }>;
  shippingAddress: {
    address: string;
    city: string;
    postalCode: string;
    country: string;
  };
  itemsPrice: number;
  taxPrice: number;
  totalPrice: number;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Canceled';
  paymentMethod: string;
  isPaid: boolean;
  coinsRedeemed: number;
  coinsEarned: number;
  escrowStatus?: 'held' | 'released' | 'refunded' | 'disputed' | 'dispute_rejected';
  escrowReleasedAt?: Date;
  deliveredAt?: Date;
  returnRequestReason?: string;
  disputeNotes?: string;
  trackingNumber?: string;
  shippingLabelUrl?: string;
  estimatedDeliveryDate?: Date;
  shippingHistory?: Array<{ status: string; location: string; timestamp: Date }>;
  paymentOrderCode?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    user: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    shop: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Shop',
    },
    parentOrderId: {
      type: String,
    },
    shippingFee: {
      type: Number,
      required: true,
      default: 0.0,
    },
    shippingCarrier: {
      type: String,
    },
    orderItems: [
      {
        name: { type: String, required: true },
        qty: { type: Number, required: true },
        image: { type: String, required: true },
        price: { type: Number, required: true },
        product: {
          type: Schema.Types.ObjectId,
          required: true,
          ref: 'Product',
        },
      },
    ],
    shippingAddress: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    itemsPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    taxPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    totalPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    status: {
      type: String,
      required: true,
      enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Canceled'],
      default: 'Pending',
    },
    paymentMethod: {
      type: String,
      default: 'COD',
    },
    isPaid: {
      type: Boolean,
      required: true,
      default: false,
    },
    coinsRedeemed: {
      type: Number,
      default: 0,
    },
    coinsEarned: {
      type: Number,
      default: 0,
    },
    escrowStatus: {
      type: String,
      enum: ['held', 'released', 'refunded', 'disputed', 'dispute_rejected'],
      default: 'held'
    },
    escrowReleasedAt: {
      type: Date
    },
    deliveredAt: {
      type: Date
    },
    returnRequestReason: {
      type: String
    },
    disputeNotes: {
      type: String
    },
    trackingNumber: {
      type: String
    },
    shippingLabelUrl: {
      type: String
    },
    estimatedDeliveryDate: {
      type: Date
    },
    shippingHistory: [
      {
        status: { type: String, required: true },
        location: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    paymentOrderCode: {
      type: Number,
      unique: true,
      sparse: true
    }
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IOrder>('Order', orderSchema);
