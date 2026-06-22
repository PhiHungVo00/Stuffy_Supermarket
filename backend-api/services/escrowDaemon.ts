import Order from '../models/Order';
import SellerWallet from '../models/SellerWallet';

export class EscrowDaemon {
  private static intervalId: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Starts the background daemon that checks for expired escrows.
   * Runs every 1 minute in development, but processes orders older than 3 days.
   */
  public static start(checkIntervalMs: number = 60000, expiryDays: number = 3) {
    if (this.intervalId) {
      console.log('[EscrowDaemon] Already running.');
      return;
    }

    console.log(`[EscrowDaemon] Started background worker (interval: ${checkIntervalMs}ms, expiry: ${expiryDays} days).`);
    this.intervalId = setInterval(() => {
      this.processExpiredEscrows(expiryDays).catch(err => {
        console.error('[EscrowDaemon] Error processing expired escrows:', err.message);
      });
    }, checkIntervalMs);
  }

  /**
   * Stops the background daemon.
   */
  public static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[EscrowDaemon] Stopped background worker.');
    }
  }

  /**
   * Scans database and releases held escrows that are older than the threshold.
   */
  public static async processExpiredEscrows(expiryDays: number): Promise<number> {
    if (this.isRunning) return 0;
    this.isRunning = true;

    try {
      const cutoffDate = new Date(Date.now() - expiryDays * 24 * 60 * 60 * 1000);
      
      // Find orders that are delivered, escrow is still held, and delivery date was before cutoffDate
      const expiredOrders = await Order.find({
        status: 'Delivered',
        escrowStatus: 'held',
        deliveredAt: { $lte: cutoffDate }
      });

      if (expiredOrders.length === 0) {
        this.isRunning = false;
        return 0;
      }

      console.log(`[EscrowDaemon] Found ${expiredOrders.length} expired escrows to process.`);
      let processedCount = 0;

      for (const order of expiredOrders) {
        // Update order status
        order.escrowStatus = 'released';
        order.escrowReleasedAt = new Date();
        await order.save();

        // Update seller wallet
        let wallet = await SellerWallet.findOne({ shopId: order.shop });
        if (!wallet) {
          wallet = new SellerWallet({
            shopId: order.shop,
            balance: 0,
            pendingEscrow: 0,
            currency: 'USD',
            transactions: []
          });
        }

        // Adjust escrow & balance safely
        wallet.pendingEscrow = Math.max(0, Math.round((wallet.pendingEscrow - order.totalPrice) * 100) / 100);
        wallet.balance = Math.round((wallet.balance + order.totalPrice) * 100) / 100;
        
        wallet.transactions.push({
          amount: order.totalPrice,
          type: 'escrow_payout',
          description: `Auto-released escrow (expired after ${expiryDays} days) for order ${order._id}`,
          orderId: order._id,
          createdAt: new Date()
        });

        await wallet.save();
        console.log(`[EscrowDaemon] Released escrow for order ${order._id} ($${order.totalPrice}) to shop ${order.shop}`);
        processedCount++;
      }

      this.isRunning = false;
      return processedCount;
    } catch (err: any) {
      this.isRunning = false;
      throw err;
    }
  }
}
