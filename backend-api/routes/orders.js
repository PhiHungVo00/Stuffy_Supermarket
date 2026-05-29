const express = require('express');
const router = express.Router();
const authModule = require('../middleware/auth');
const protect = authModule.protect || authModule.default?.protect;
const admin = authModule.admin || authModule.default?.admin;
const OrderModule = require('../models/Order');
const Order = OrderModule.default || OrderModule;
const ProductModule = require('../models/Product');
const Product = ProductModule.default || ProductModule;

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
router.post('/', protect, async (req, res) => {
  const { orderItems, shippingAddress, itemsPrice, taxPrice, totalPrice, paymentMethod } = req.body;

  if (orderItems && orderItems.length === 0) {
    res.status(400).json({ error: 'No order items' });
    return;
  }

  try {
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

    for (const item of orderItems) {
      if (item.product) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { countInStock: -(item.qty || 1) }
        });
      }
    }

    res.status(201).json(createdOrder);
  } catch (error) {
    console.error('[Orders] Error saving order:', error.message);
    res.status(500).json({ error: 'Server error creating order' });
  }
});

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
router.get('/myorders', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Server error getting orders' });
  }
});

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = 10;
    const status = req.query.status;

    const query = status && status !== 'All' ? { status } : {};
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

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
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

// @desc    Update order status (Admin)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
router.put('/:id/status', protect, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const { status } = req.body;
    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Canceled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    order.status = status;
    if (status === 'Delivered') {
      order.isPaid = true;
    }

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: 'Server error updating order status' });
  }
});

module.exports = router;
