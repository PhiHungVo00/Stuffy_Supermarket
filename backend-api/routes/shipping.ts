import express, { Response } from 'express';
import { protect } from '../middleware/auth';
import Order from '../models/Order';
import Shop from '../models/Shop';
import User from '../models/User';
import CoinTransaction from '../models/CoinTransaction';
import { sendPushNotification } from '../services/webPush';

const router = express.Router();

// POST /api/shipping/fulfill - Arrange shipment for order
router.post('/fulfill', protect, async (req: any, res: Response) => {
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ error: 'Order ID is required' });
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Verify user owns the shop
    if (req.user.role !== 'admin') {
      const shop = await Shop.findOne({ owner: req.user._id });
      if (!shop || order.shop.toString() !== shop._id.toString()) {
        return res.status(403).json({ error: 'Not authorized to fulfill this order' });
      }
    }

    if (order.status !== 'Pending') {
      return res.status(400).json({ error: `Order is already in ${order.status} state` });
    }

    // Generate tracking number and label URL
    const carrier = order.shippingCarrier || 'ghn';
    const trackingNumber = `STUFFY-${carrier.toUpperCase()}-${order._id.toString().substring(18).toUpperCase()}`;
    
    const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
    const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';
    const shippingLabelUrl = `${API_BASE}/api/shipping/label/${order._id}`;

    order.status = 'Processing';
    order.trackingNumber = trackingNumber;
    order.shippingLabelUrl = shippingLabelUrl;
    order.shippingHistory = [
      {
        status: 'MANIFEST_CREATED',
        location: 'Seller Warehouse',
        timestamp: new Date()
      }
    ];

    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`user_room:${order.user.toString()}`).emit('ORDER_STATUS_UPDATE', {
        orderId: order._id,
        status: 'Processing'
      });
    }

    // Gửi thông báo đẩy ngoại tuyến
    sendPushNotification(
      order.user.toString(),
      'Cập nhật đơn hàng',
      `Đơn hàng #${order._id.toString().slice(-8).toUpperCase()} đang được xử lý (Processing).`
    );

    res.json({ message: 'Shipment arranged successfully', order });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shipping/label/:orderId - Mock Printable Shipping Label (HTML page)
router.get('/label/:orderId', async (req: any, res: Response) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('shop').populate('user');
    if (!order) {
      return res.status(404).send('<h1>Order not found</h1>');
    }

    const shopName = (order.shop as any)?.name || 'Stuffy Seller';
    const buyerName = (order.user as any)?.name || 'Buyer';

    res.send(`
      <html>
        <head>
          <title>Stuffy Supermarket Shipping Label</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; margin: 30px; color: #000; }
            .label-card { width: 450px; border: 4px solid #000; padding: 20px; }
            .header { display: flex; justify-content: space-between; border-bottom: 3px double #000; padding-bottom: 10px; margin-bottom: 15px; }
            .barcode { font-size: 2.2rem; background: #000; color: #fff; text-align: center; padding: 15px; font-weight: bold; letter-spacing: 5px; margin: 15px 0; }
            .address-box { display: grid; grid-template-columns: 1fr; gap: 10px; font-size: 0.9rem; border-bottom: 1px solid #000; padding-bottom: 15px; }
            .meta { font-size: 0.85rem; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="label-card">
            <div class="header">
              <div><strong>STUFFY SHIP</strong></div>
              <div>CARRIER: <strong>${(order.shippingCarrier || 'GHN').toUpperCase()}</strong></div>
            </div>
            <div class="address-box">
              <div><strong>FROM:</strong><br/>${shopName}<br/>District: Thủ Đức, HCMC</div>
              <div><strong>TO:</strong><br/>${buyerName}<br/>${order.shippingAddress.address}, ${order.shippingAddress.city}, ${order.shippingAddress.postalCode}</div>
            </div>
            <div class="barcode">
              ||| |||| || ||| ||||
              <div style="font-size: 0.75rem; letter-spacing: 0; font-weight: normal; margin-top: 5px;">${order.trackingNumber || 'PENDING'}</div>
            </div>
            <div class="meta">
              <strong>Order ID:</strong> #${order._id.toString().substring(0, 8).toUpperCase()}<br/>
              <strong>Weight:</strong> 1.5 kg | <strong>Total Price:</strong> $${order.totalPrice}
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send('<h1>Server Error</h1>');
  }
});

// POST /api/shipping/webhook - 3PL Logistics update receiver
router.post('/webhook', async (req: any, res: Response) => {
  let trackingNumber = req.body.trackingNumber;
  let carrierStatus = req.body.carrierStatus;
  let location = req.body.location;

  // Detect GHN webhook format
  if (req.body.OrderCode !== undefined && req.body.Status !== undefined) {
    trackingNumber = req.body.OrderCode;
    const ghnStatus = req.body.Status;
    if (ghnStatus === 'cancel') {
      carrierStatus = 'CANCELED';
    } else if (ghnStatus === 'delivered') {
      carrierStatus = 'DELIVERED';
    } else if (['picked', 'storing', 'transporting', 'delivering', 'money_collect_picking'].includes(ghnStatus)) {
      carrierStatus = 'IN_TRANSIT';
    } else {
      carrierStatus = 'PICKED_UP';
    }
    location = req.body.Warehouse ? `GHN Hub (${req.body.Warehouse})` : 'GHN Transit Hub';
  }
  // Detect GHTK webhook format
  else if (req.body.label_id !== undefined && req.body.status_id !== undefined) {
    trackingNumber = req.body.label_id;
    const ghtkStatus = Number(req.body.status_id);
    if ([5, 6].includes(ghtkStatus)) {
      carrierStatus = 'DELIVERED';
    } else if ([2, 3, 4, 12, 123].includes(ghtkStatus)) {
      carrierStatus = 'IN_TRANSIT';
    } else if ([-1, 9, 21].includes(ghtkStatus)) {
      carrierStatus = 'CANCELED';
    } else {
      carrierStatus = 'PICKED_UP';
    }
    location = req.body.reason ? `GHTK Hub (${req.body.reason})` : 'GHTK Transit Hub';
  }

  if (!trackingNumber || !carrierStatus) {
    return res.status(400).json({ error: 'trackingNumber and carrierStatus are required' });
  }

  try {
    const order = await Order.findOne({ trackingNumber });
    if (!order) {
      return res.status(404).json({ error: 'Order not found for tracking number' });
    }

    const previousStatus = order.status;

    // Append shipping history log
    order.shippingHistory!.push({
      status: carrierStatus,
      location: location || 'Transit Hub',
      timestamp: new Date()
    });

    // Map 3PL status to Order status
    let newStatus = order.status;
    if (carrierStatus === 'PICKED_UP' || carrierStatus === 'IN_TRANSIT') {
      newStatus = 'Shipped';
    } else if (carrierStatus === 'CANCELED') {
      newStatus = 'Canceled';
    } else if (carrierStatus === 'DELIVERED') {
      newStatus = 'Delivered';
    }

    // 🔒 SECURITY FIX: Prevent Webhook Replay Attack
    let isFirstTimeDelivered = false;
    if (newStatus === 'Delivered' && order.status !== 'Delivered') {
      const updatedOrder = await Order.findOneAndUpdate(
        { _id: order._id, status: { $ne: 'Delivered' } },
        { status: 'Delivered', deliveredAt: new Date(), isPaid: true },
        { new: true }
      );
      if (updatedOrder) {
        isFirstTimeDelivered = true;
      }
    }

    order.status = newStatus;
    if (newStatus === 'Delivered') {
      order.deliveredAt = order.deliveredAt || new Date();
      order.isPaid = true;
    }

    await order.save();

    if (isFirstTimeDelivered) {
      const coinsEarned = order.coinsEarned || 0;
      if (coinsEarned > 0) {
        await User.findByIdAndUpdate(order.user, { $inc: { coinsBalance: coinsEarned } });
        await CoinTransaction.findOneAndUpdate(
          { orderId: order._id, type: 'earn' },
          { isCredited: true }
        );
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`user_room:${order.user.toString()}`).emit('ORDER_STATUS_UPDATE', {
        orderId: order._id,
        status: order.status
      });
    }

    // Gửi thông báo đẩy ngoại tuyến
    sendPushNotification(
      order.user.toString(),
      'Cập nhật đơn hàng',
      `Đơn hàng #${order._id.toString().slice(-8).toUpperCase()} có trạng thái mới: ${order.status}.`
    );

    res.json({ message: 'Logistics webhook processed successfully', order });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
