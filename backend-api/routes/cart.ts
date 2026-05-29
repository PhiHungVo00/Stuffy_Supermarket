import express, { Response } from 'express';
import User from '../models/User';
import { protect } from '../middleware/auth';

const router = express.Router();

router.get('/', protect, async (req: any, res: Response) => {
  try {
    const user = await User.findById(req.user._id);
    res.json(user?.cart || []);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching cart' });
  }
});

router.post('/', protect, async (req: any, res: Response) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.cart = req.body.cartItems || [];
    await user.save();
    res.json(user.cart);
  } catch (error) {
    res.status(500).json({ error: 'Server error syncing cart' });
  }
});

export default router;
