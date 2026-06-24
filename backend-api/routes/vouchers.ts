import express, { Response } from 'express';
import { protect } from '../middleware/auth';
import Voucher from '../models/Voucher';
import Shop from '../models/Shop';

const router = express.Router();

// GET /api/vouchers/mine - Get vouchers of the logged-in seller's shop or all vouchers if admin
router.get('/mine', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Seller or Admin role required.' });
    }

    if (req.user.role === 'admin') {
      const vouchers = await Voucher.find({});
      return res.json(vouchers);
    }

    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this seller' });
    }

    const vouchers = await Voucher.find({ shopId: shop._id });
    res.json(vouchers);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error getting vouchers' });
  }
});

// GET /api/vouchers/shop/:shopId - Get active, unexpired vouchers for a specific shop
router.get('/shop/:shopId', async (req: any, res: Response) => {
  try {
    const vouchers = await Voucher.find({
      shopId: req.params.shopId,
      isActive: true,
      expiresAt: { $gt: new Date() }
    });
    res.json(vouchers);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error getting shop vouchers' });
  }
});

// POST /api/vouchers - Create a new voucher
router.post('/', protect, async (req: any, res: Response) => {
  const {
    code,
    type,
    discountType,
    discountValue,
    description,
    minOrderValue,
    maxDiscount,
    usageLimit,
    expiresAt,
    scope,
    shopId,
    isLivestreamExclusive
  } = req.body;

  if (!code || !type || !discountType || !discountValue || !description || !expiresAt) {
    return res.status(400).json({ error: 'Code, type, discountType, discountValue, description, and expiresAt are required.' });
  }

  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Seller or Admin role required.' });
    }

    const formattedCode = code.trim().toUpperCase();
    const existingVoucher = await Voucher.findOne({ code: formattedCode });
    if (existingVoucher) {
      return res.status(400).json({ error: `Voucher code ${formattedCode} already exists.` });
    }

    let finalScope = scope || 'shop';
    let finalShopId = shopId;

    if (req.user.role === 'seller') {
      const shop = await Shop.findOne({ owner: req.user._id });
      if (!shop) {
        return res.status(404).json({ error: 'Shop not found for this seller' });
      }
      finalScope = 'shop';
      finalShopId = shop._id;
    } else if (req.user.role === 'admin' && finalScope === 'shop' && !finalShopId) {
      return res.status(400).json({ error: 'shopId is required for shop-scoped vouchers.' });
    }

    const voucher = new Voucher({
      code: formattedCode,
      type,
      discountType,
      discountValue: Number(discountValue),
      description,
      minOrderValue: minOrderValue ? Number(minOrderValue) : 0,
      maxDiscount: maxDiscount ? Number(maxDiscount) : 0,
      usageLimit: usageLimit ? Number(usageLimit) : 100,
      expiresAt: new Date(expiresAt),
      scope: finalScope,
      shopId: finalScope === 'shop' ? finalShopId : undefined,
      isLivestreamExclusive: !!isLivestreamExclusive,
      tenantId: 'default_store'
    });

    const savedVoucher = await voucher.save();
    res.status(201).json(savedVoucher);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error creating voucher' });
  }
});

// PUT /api/vouchers/:id - Update or toggle active status
router.put('/:id', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Seller or Admin role required.' });
    }

    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    if (req.user.role === 'seller') {
      const shop = await Shop.findOne({ owner: req.user._id });
      if (!shop || voucher.shopId?.toString() !== shop._id.toString()) {
        return res.status(403).json({ error: 'Not authorized to manage this voucher.' });
      }
    }

    const {
      code,
      type,
      discountType,
      discountValue,
      description,
      minOrderValue,
      maxDiscount,
      usageLimit,
      expiresAt,
      isActive,
      isLivestreamExclusive
    } = req.body;

    if (code) {
      const formattedCode = code.trim().toUpperCase();
      if (formattedCode !== voucher.code) {
        const existing = await Voucher.findOne({ code: formattedCode });
        if (existing) {
          return res.status(400).json({ error: `Voucher code ${formattedCode} already exists.` });
        }
        voucher.code = formattedCode;
      }
    }

    if (type !== undefined) voucher.type = type;
    if (discountType !== undefined) voucher.discountType = discountType;
    if (discountValue !== undefined) voucher.discountValue = Number(discountValue);
    if (description !== undefined) voucher.description = description;
    if (minOrderValue !== undefined) voucher.minOrderValue = Number(minOrderValue);
    if (maxDiscount !== undefined) voucher.maxDiscount = Number(maxDiscount);
    if (usageLimit !== undefined) voucher.usageLimit = Number(usageLimit);
    if (expiresAt !== undefined) voucher.expiresAt = new Date(expiresAt);
    if (isActive !== undefined) voucher.isActive = !!isActive;
    if (isLivestreamExclusive !== undefined) voucher.isLivestreamExclusive = !!isLivestreamExclusive;

    const updatedVoucher = await voucher.save();
    res.json(updatedVoucher);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error updating voucher' });
  }
});

// DELETE /api/vouchers/:id - Delete a voucher
router.delete('/:id', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Seller or Admin role required.' });
    }

    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    if (req.user.role === 'seller') {
      const shop = await Shop.findOne({ owner: req.user._id });
      if (!shop || voucher.shopId?.toString() !== shop._id.toString()) {
        return res.status(403).json({ error: 'Not authorized to delete this voucher.' });
      }
    }

    await voucher.deleteOne();
    res.json({ message: 'Voucher successfully deleted.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error deleting voucher' });
  }
});

// POST /api/vouchers/:id/claim - Claim a voucher for current user
router.post('/:id/claim', protect, async (req: any, res: Response) => {
  try {
    const voucherInfo = await Voucher.findById(req.params.id);
    if (!voucherInfo) {
      return res.status(404).json({ error: 'Voucher not found.' });
    }

    if (!voucherInfo.isActive || new Date(voucherInfo.expiresAt) <= new Date()) {
      return res.status(400).json({ error: 'This voucher has expired or is inactive.' });
    }

    // 🔒 SECURITY FIX: Voucher Claim Race Condition
    // Use atomic findOneAndUpdate with $addToSet to prevent duplicate claims
    // and $expr to prevent exceeding usage limit.
    const updatedVoucher = await Voucher.findOneAndUpdate(
      {
        _id: req.params.id,
        claimedBy: { $ne: req.user._id },
        $expr: { $lt: [{ $size: '$claimedBy' }, '$usageLimit'] }
      },
      {
        $addToSet: { claimedBy: req.user._id }
      },
      { new: true }
    );

    if (!updatedVoucher) {
      if (voucherInfo.claimedBy.includes(req.user._id)) {
        return res.status(400).json({ error: 'You have already claimed this voucher.' });
      } else {
        return res.status(400).json({ error: 'This voucher is fully claimed.' });
      }
    }

    res.json({ message: 'Voucher claimed successfully!', voucher: updatedVoucher });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error claiming voucher' });
  }
});

export default router;
