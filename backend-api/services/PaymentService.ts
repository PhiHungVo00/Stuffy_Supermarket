import Stripe from 'stripe';
import PaymentTrace from '../models/PaymentTrace';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_stuffy_supermarket', {
  apiVersion: '2024-04-10',
});

export class PaymentService {
  /**
   * Process a payment intent with a built-in Idempotency check.
   * Ensures 'Double Spending' is impossible.
   */
  static async createPaymentIntent(
    tenantId: string, 
    amount: number, 
    currency: string,
    idempotencyKey: string
  ) {
    // 1. Check if we've already processed this exact key
    const existingTrace = await PaymentTrace.findOne({ idempotencyKey, tenantId });
    
    if (existingTrace) {
      console.log(`[Payment] Idempotency Hit for ${idempotencyKey}. Returning saved result.`);
      return existingTrace.responseBody;
    }

    // 2. Initializing payment trace to 'pending' to lock the key
    const trace = new PaymentTrace({ idempotencyKey, tenantId, status: 'pending' });
    await trace.save();

    try {
      let paymentIntent;
      const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_stuffy_supermarket';
      
      if (stripeKey && !stripeKey.startsWith('sk_test_mock')) {
        // 3. Requesting Stripe with their native idempotencyKey support as well
        paymentIntent = await stripe.paymentIntents.create(
          {
            amount: Math.round(amount * 100), // Stripe expects cents
            currency,
            metadata: { tenantId },
          },
          { idempotencyKey } // Stripe-level safety
        );
      } else {
        // Mock Stripe payment intent for local dev
        console.log(`[Payment] Stripe Secret Key is mock (${stripeKey}). Processing local mock transaction.`);
        paymentIntent = {
          client_secret: `mock_secret_stuffy_${Math.random().toString(36).substr(2, 9)}`,
          id: `pi_mock_stuffy_${Math.random().toString(36).substr(2, 9)}`,
          amount: Math.round(amount * 100),
        };
      }

      // 4. Update trace to 'completed' and store the result
      trace.status = 'completed';
      trace.responseBody = {
        clientSecret: paymentIntent.client_secret,
        id: paymentIntent.id,
        amount: paymentIntent.amount,
      };
      await trace.save();

      return trace.responseBody;
    } catch (err: any) {
      // 5. Update trace to 'failed' on error
      trace.status = 'failed';
      trace.responseBody = { error: err.message };
      await trace.save();
      throw err;
    }
  }
}
