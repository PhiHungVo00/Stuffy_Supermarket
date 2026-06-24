import express, { Request, Response } from 'express';
import { protect } from '../middleware/auth';
import Order from '../models/Order';
import { PayOSService } from '../services/PayOSService';

const router = express.Router();

// POST /api/payments/payos/create-link - Create PayOS VietQR payment link
router.post('/create-link', protect, async (req: any, res: Response) => {
  try {
    const { orderId, parentOrderId, originHost = 'http://localhost:3000' } = req.body;

    let orders: any[] = [];
    if (parentOrderId) {
      orders = await Order.find({ parentOrderId, user: req.user._id });
    } else if (orderId) {
      const order = await Order.findOne({ _id: orderId, user: req.user._id });
      if (order) orders.push(order);
    }

    if (orders.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng tương ứng.' });
    }

    // Sum totalPrice of all split orders in the group
    const totalPrice = orders.reduce((sum, o) => sum + o.totalPrice, 0);

    // Combine order items
    const orderItems: any[] = [];
    for (const o of orders) {
      orderItems.push(...o.orderItems);
    }

    // Use primary carrier order
    const primaryOrder = orders[0];
    primaryOrder.totalPrice = totalPrice;
    primaryOrder.orderItems = orderItems;

    const paymentLinkData = await PayOSService.createPaymentLink(primaryOrder, originHost);

    // Sync the same paymentOrderCode and method across all orders in the split group
    if (orders.length > 1) {
      for (let i = 1; i < orders.length; i++) {
        orders[i].paymentOrderCode = paymentLinkData.orderCode;
        orders[i].paymentMethod = 'VietQR';
        await orders[i].save();
      }
    }

    res.json(paymentLinkData);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Lỗi hệ thống khi tạo link thanh toán' });
  }
});

// POST /api/payments/payos/webhook - PayOS payment notification webhook
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const webhookData = await PayOSService.verifyWebhookData(req.body);
    const orderCode = webhookData?.orderCode || req.body?.data?.orderCode;
    const success = webhookData?.success || req.body?.success || req.body?.data?.desc === 'success';

    if (orderCode && success) {
      // Fetch all orders associated with this unique payment code
      const orders = await Order.find({ paymentOrderCode: orderCode });
      const io = req.app.get('io');
      for (const order of orders) {
        order.isPaid = true;
        order.status = 'Processing';
        await order.save();

        if (io) {
          io.to(`user_room:${order.user.toString()}`).emit('ORDER_STATUS_UPDATE', {
            orderId: order._id,
            status: 'Processing'
          });
        }
      }
      console.log(`[PayOS Webhook] Giao dịch thành công cho mã đơn hàng ${orderCode}. Đã cập nhật trạng thái của ${orders.length} đơn hàng.`);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[PayOS Webhook] Lỗi xác thực Webhook:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// GET /api/payments/payos/mock-checkout-page - Render a simulated QR Transfer page for Sandbox testing
router.get('/mock-checkout-page', async (req: Request, res: Response) => {
  const { orderCode, amount } = req.query;

  const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Cổng Thanh Toán Giả Lập VietQR</title>
      <style>
        body {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          background-color: #0b0f19;
          color: #f1f5f9;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          background: rgba(17, 24, 39, 0.85);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 28px;
          padding: 40px;
          width: 100%;
          max-width: 420px;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
        }
        h2 { margin-top: 0; color: #6366f1; font-weight: 800; font-size: 1.6rem; letter-spacing: -0.025em; }
        .amount {
          font-size: 2.2rem;
          font-weight: 900;
          color: #10b981;
          margin: 24px 0;
        }
        .qr-mock {
          width: 220px;
          height: 220px;
          background: white;
          margin: 20px auto;
          padding: 12px;
          border-radius: 20px;
          display: flex;
          justify-content: center;
          align-items: center;
          box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        }
        .qr-mock img {
          width: 100%;
          height: 100%;
        }
        .desc {
          font-size: 0.85rem;
          color: #64748b;
          margin-bottom: 32px;
        }
        .btn {
          width: 100%;
          padding: 15px;
          background: #6366f1;
          color: white;
          border: none;
          border-radius: 14px;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(99,102,241,0.3);
        }
        .btn:hover { background: #4f46e5; transform: translateY(-1px); }
        .btn-cancel {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #94a3b8;
          margin-top: 12px;
          box-shadow: none;
        }
        .btn-cancel:hover { background: rgba(255,255,255,0.05); color: #f1f5f9; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Giả Lập Thanh Toán VietQR (PayOS)</h2>
        <p style="font-size: 0.9rem; color: #94a3b8; line-height: 1.5; margin: 0 0 20px 0;">Vui lòng quét mã QR dưới đây hoặc bấm xác nhận để hoàn tất đơn hàng.</p>
        <div class="amount">${Number(amount).toLocaleString('vi-VN')} VND</div>
        <div class="qr-mock">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=STUFFY-PAYOS-${orderCode}" alt="VietQR Mock">
        </div>
        <div class="desc">Mã giao dịch: ${orderCode} (Chế độ Thử Nghiệm)</div>
        <button class="btn" onclick="confirmPayment()">Xác nhận chuyển khoản thành công</button>
        <button class="btn btn-cancel" onclick="cancelPayment()">Hủy thanh toán</button>
      </div>

      <script>
        async function confirmPayment() {
          try {
            const response = await fetch('/api/payments/payos/webhook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                success: true,
                data: {
                  orderCode: ${orderCode},
                  amount: ${amount},
                  desc: 'success'
                }
              })
            });
            if (response.ok) {
              alert('Thanh toán thành công! Trở về trang giỏ hàng.');
              window.location.href = 'http://localhost:3000/cart?success=true&orderCode=${orderCode}';
            } else {
              alert('Có lỗi xảy ra khi xác nhận thanh toán.');
            }
          } catch (err) {
            alert('Lỗi kết nối: ' + err.message);
          }
        }
        function cancelPayment() {
          window.location.href = 'http://localhost:3000/cart?cancel=true&orderCode=${orderCode}';
        }
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

export default router;
