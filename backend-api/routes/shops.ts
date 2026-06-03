import express, { Response } from 'express';
import { protect } from '../middleware/auth';
import Shop from '../models/Shop';
import SellerWallet from '../models/SellerWallet';

const router = express.Router();

// GET /api/shops - List all shops for the current tenant
router.get('/', async (req: any, res: Response) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default_store';
    const shops = await Shop.find({ tenantId });
    res.json(shops);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error getting shops' });
  }
});

// GET /api/shops/mine - GET logged-in seller's shop
router.get('/mine', protect, async (req: any, res: Response) => {
  try {
    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this seller' });
    }
    res.json(shop);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error getting shop' });
  }
});

// PUT /api/shops/mine/decorate - Save layout configuration for seller's shop
router.put('/mine/decorate', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only sellers or admins can decorate their storefront' });
    }

    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this seller' });
    }

    const { decorationConfig } = req.body;
    shop.decorationConfig = decorationConfig;
    const updatedShop = await shop.save();

    res.json(updatedShop);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error saving decoration' });
  }
});

// GET /api/shops/:id - GET specific shop by ID
router.get('/:id', async (req: any, res: Response) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    res.json(shop);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error getting shop' });
  }
});

// POST /api/shops - Create a new shop (only for sellers/admins)
router.post('/', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only sellers or admins can create a shop' });
    }

    const { name, description, logo } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Shop name is required' });
    }

    const shopExists = await Shop.findOne({ name });
    if (shopExists) {
      return res.status(400).json({ error: 'Shop name already exists' });
    }

    const tenantId = (req.headers['x-tenant-id'] as string) || req.user.tenantId || 'default_store';

    const shop = await Shop.create({
      name,
      owner: req.user._id,
      description: description || '',
      logo: logo || '',
      tenantId
    });

    res.status(201).json(shop);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error creating shop' });
  }
});

// GET /api/shops/mine/wallet - Fetch seller wallet
router.get('/mine/wallet', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Seller role required.' });
    }
    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this seller' });
    }

    let wallet = await SellerWallet.findOne({ shopId: shop._id });
    if (!wallet) {
      wallet = new SellerWallet({
        shopId: shop._id,
        balance: 0,
        pendingEscrow: 0,
        currency: 'USD',
        transactions: []
      });
      await wallet.save();
    }

    res.json(wallet);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error getting wallet' });
  }
});

// POST /api/shops/mine/wallet/withdraw - Request withdrawal
router.post('/mine/wallet/withdraw', protect, async (req: any, res: Response) => {
  const { amount, bankName, accountNumber } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid withdrawal amount is required' });
  }
  if (!bankName || !accountNumber) {
    return res.status(400).json({ error: 'Bank name and account number are required' });
  }

  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Seller role required.' });
    }
    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this seller' });
    }

    let wallet = await SellerWallet.findOne({ shopId: shop._id });
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    wallet.balance = Math.round((wallet.balance - amount) * 100) / 100;
    wallet.transactions.push({
      amount: -amount,
      type: 'withdrawal',
      description: `Withdrawal to ${bankName} (${accountNumber})`,
      createdAt: new Date()
    });
    await wallet.save();

    res.json({ message: 'Withdrawal successful', wallet });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error processing withdrawal' });
  }
});

export default router;
