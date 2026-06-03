import express, { Response } from 'express';
import { protect } from '../middleware/auth';
import Promotion from '../models/Promotion';
import Shop from '../models/Shop';

const router = express.Router();

// GET /api/promotions - List all promotions for the logged-in seller's shop
router.get('/', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Seller role required.' });
    }
    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this seller' });
    }

    const promotions = await Promotion.find({ shopId: shop._id });
    res.json(promotions);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error getting promotions' });
  }
});

// GET /api/promotions/active/:shopId - Public route to get active promotions for a shop
router.get('/active/:shopId', async (req: any, res: Response) => {
  try {
    const promotions = await Promotion.find({
      shopId: req.params.shopId,
      status: 'active',
      startsAt: { $lte: new Date() },
      endsAt: { $gte: new Date() }
    }).populate('addonProducts.product').populate('primaryProductId');
    res.json(promotions);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error getting active promotions' });
  }
});

// POST /api/promotions - Create a new promotion
router.post('/', protect, async (req: any, res: Response) => {
  const { name, type, minQuantity, discountType, discountValue, primaryProductId, addonProducts, startsAt, endsAt } = req.body;
  if (!name || !type || !startsAt || !endsAt) {
    return res.status(400).json({ error: 'Name, type, startsAt, and endsAt are required fields' });
  }

  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Seller role required.' });
    }
    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this seller' });
    }

    const promotion = new Promotion({
      shopId: shop._id,
      name,
      type,
      minQuantity,
      discountType,
      discountValue,
      primaryProductId,
      addonProducts,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt)
    });

    const savedPromo = await promotion.save();
    res.status(201).json(savedPromo);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error creating promotion' });
  }
});

// PUT /api/promotions/:id - Update or toggle promotion status
router.put('/:id', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Seller role required.' });
    }
    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this seller' });
    }

    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    if (promotion.shopId.toString() !== shop._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to manage this promotion' });
    }

    const fieldsToUpdate = req.body;
    Object.assign(promotion, fieldsToUpdate);
    const updatedPromo = await promotion.save();

    res.json(updatedPromo);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error updating promotion' });
  }
});

// DELETE /api/promotions/:id - Delete a promotion
router.delete('/:id', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Seller role required.' });
    }
    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this seller' });
    }

    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    if (promotion.shopId.toString() !== shop._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this promotion' });
    }

    await promotion.deleteOne();
    res.json({ message: 'Promotion successfully deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error deleting promotion' });
  }
});

export default router;
