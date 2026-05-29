import express, { Response } from 'express';
import { protect, admin } from '../middleware/auth';
import Order from '../models/Order';
import Product from '../models/Product';
import Voucher from '../models/Voucher';

const router = express.Router();

router.post('/', protect, async (req: any, res: Response) => {
  const { orderItems, shippingAddress, itemsPrice, taxPrice, totalPrice, paymentMethod, voucherCode } = req.body;

  if (!orderItems || orderItems.length === 0) {
    res.status(400).json({ error: 'No order items' });
    return;
  }

  try {
    for (const item of orderItems) {
      if (item.product) {
        const product = await Product.findById(item.product);
        if (!product) {
          return res.status(400).json({ error: `Product ${item.product} not found` });
        }
        if (product.countInStock < (item.qty || 1)) {
          return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${product.countInStock}` });
        }
      }
    }

    const order = new Order({
      user: req.user._id,
      orderItems,
      shippingAddress,
      itemsPrice,
      taxPrice,
      totalPrice,
      paymentMethod,
    });

    const createdOrder = await order.save();

    if (voucherCode) {
      await Voucher.findOneAndUpdate(
        { code: voucherCode.toUpperCase(), isActive: true },
        { $inc: { usedCount: 1 } }
      );
    }

    for (const item of orderItems) {
      if (item.product) {
        const qty = item.qty || 1;
        const result = await Product.findOneAndUpdate(
          { _id: item.product, countInStock: { $gte: qty } },
          { $inc: { countInStock: -qty } }
        );
        if (!result) {
          await Order.deleteOne({ _id: createdOrder._id });
          return res.status(400).json({ error: `Stock depleted for product ${item.product} during order. Order rolled back.` });
        }
      }
    }

    res.status(201).json(createdOrder);
  } catch (error: any) {
    console.error('[Orders] Error saving order:', error.message);
    res.status(500).json({ error: 'Server error creating order' });
  }
});

router.get('/myorders', protect, async (req: any, res: Response) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Server error getting orders' });
  }
});

router.get('/', protect, admin, async (req: any, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = 10;
    const status = req.query.status as string;

    const query: any = status && status !== 'All' ? { status } : {};
    const count = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .skip(pageSize * (page - 1));

    res.json({ orders, page, pages: Math.ceil(count / pageSize), total: count });
  } catch (error) {
    res.status(500).json({ error: 'Server error getting orders' });
  }
});

router.get('/:id', protect, async (req: any, res: Response) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to view this order' });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Server error getting order' });
  }
});

router.put('/:id/status', protect, admin, async (req: any, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const { status } = req.body;
    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Canceled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const previousStatus = order.status;
    order.status = status;
    if (status === 'Delivered') {
      order.isPaid = true;
    }

    if (status === 'Canceled' && previousStatus !== 'Canceled') {
      for (const item of order.orderItems) {
        if (item.product) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { countInStock: item.qty || 1 }
          });
        }
      }
    }

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: 'Server error updating order status' });
  }
});

export default router;
