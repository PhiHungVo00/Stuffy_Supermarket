const express = require('express');
const router = express.Router();
const authModule = require('../middleware/auth');
const protect = authModule.protect || authModule.default?.protect;
const UserModule = require('../models/User');
const User = UserModule.default || UserModule;

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json(user.cart || []);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching cart' });
  }
});

// @desc    Sync user cart (Overwrite whole cart)
// @route   POST /api/cart
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.cart = req.body.cartItems || [];
    await user.save();
    res.json(user.cart);
  } catch (error) {
    res.status(500).json({ error: 'Server error syncing cart' });
  }
});

module.exports = router;
