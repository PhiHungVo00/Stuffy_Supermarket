import { PayOS } from '@payos/node';
import { IOrder } from '../models/Order';
import Order from '../models/Order';

const CLIENT_ID = process.env.PAYOS_CLIENT_ID || 'mock_client_id';
const API_KEY = process.env.PAYOS_API_KEY || 'mock_api_key';
const CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY || 'mock_checksum_key';

const isMock = CLIENT_ID === 'mock_client_id' || API_KEY === 'mock_api_key';

let payosInstance: PayOS | null = null;
if (!isMock) {
  try {
    payosInstance = new PayOS({ clientId: CLIENT_ID, apiKey: API_KEY, checksumKey: CHECKSUM_KEY });
    console.log('[PayOS] Initialized successfully with real credentials.');
  } catch (err: any) {
    console.error('[PayOS] Initialization failed:', err.message);
  }
} else {
  console.log('[PayOS] Running in MOCK mode. Real API keys not found in .env.');
}

export class PayOSService {
  /**
   * Convert USD amount to VND for PayOS processing (VietQR strictly operates in VND)
   */
  static usdToVnd(usdAmount: number): number {
    const exchangeRate = 25000; // 1 USD = 25,000 VND
    return Math.round(usdAmount * exchangeRate);
  }

  /**
   * Create a checkout payment link
   */
  static async createPaymentLink(order: IOrder, originHost: string) {
    // Generate a unique 15-digit orderCode safe integer for PayOS
    const paymentOrderCode = Date.now() * 100 + Math.floor(Math.random() * 100);

    // Save the code to the Order document
    order.paymentOrderCode = paymentOrderCode;
    order.paymentMethod = 'VietQR';
    await order.save();

    const amountVnd = this.usdToVnd(order.totalPrice);

    // Description must be alphanumeric and up to 25 characters for some banks
    const description = `Stuffy Order ${order._id.toString().substring(18)}`;

    const cancelUrl = `${originHost}/cart?cancel=true&orderCode=${paymentOrderCode}`;
    const returnUrl = `${originHost}/cart?success=true&orderCode=${paymentOrderCode}`;

    const paymentData = {
      orderCode: paymentOrderCode,
      amount: amountVnd,
      description: description,
      cancelUrl,
      returnUrl,
      items: order.orderItems.map(item => ({
        name: item.name.substring(0, 50),
        quantity: item.qty,
        price: this.usdToVnd(item.price)
      }))
    };

    // If order total does not match item sum exactly, adjust the first item's price
    // to prevent PayOS validation errors.
    const itemsSum = paymentData.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (itemsSum !== amountVnd && paymentData.items.length > 0) {
      const difference = amountVnd - itemsSum;
      paymentData.items[0].price += Math.round(difference / paymentData.items[0].quantity);
    }

    if (isMock || !payosInstance) {
      // Return a simulated local mock checkout URL
      const mockCheckoutUrl = `${originHost.replace('http://localhost:3000', 'http://localhost:5000')}/api/payments/payos/mock-checkout-page?orderCode=${paymentOrderCode}&amount=${amountVnd}`;
      return {
        checkoutUrl: mockCheckoutUrl,
        orderCode: paymentOrderCode,
        isMock: true
      };
    }

    try {
      const response = await payosInstance.paymentRequests.create(paymentData);
      return {
        checkoutUrl: response.checkoutUrl,
        orderCode: paymentOrderCode,
        isMock: false
      };
    } catch (err: any) {
      console.error('[PayOS] Error creating payment link:', err);
      // Fallback to mock link if PayOS API returns error during testing
      const mockCheckoutUrl = `${originHost.replace('http://localhost:3000', 'http://localhost:5000')}/api/payments/payos/mock-checkout-page?orderCode=${paymentOrderCode}&amount=${amountVnd}`;
      return {
        checkoutUrl: mockCheckoutUrl,
        orderCode: paymentOrderCode,
        isMock: true,
        error: err.message
      };
    }
  }

  /**
   * Verify webhook signatures
   */
  static async verifyWebhookData(body: any) {
    if (isMock || !payosInstance) {
      // Mock validation succeeds for testing purposes
      return body.data;
    }
    return await payosInstance.webhooks.verify(body);
  }
}
