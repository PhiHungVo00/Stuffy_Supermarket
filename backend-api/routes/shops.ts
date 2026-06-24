import express, { Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { protect } from '../middleware/auth';
import Shop from '../models/Shop';
import SellerWallet from '../models/SellerWallet';
import jwt from 'jsonwebtoken';
import User from '../models/User';

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

    let wallet = await SellerWallet.findOneAndUpdate(
      { shopId: shop._id },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

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

    // Simulate real bank transfer reference creation
    const referenceId = `STUFFY_WD_${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
    
    // 🔒 SECURITY FIX: Use MongoDB Atomic Update to prevent Race Condition
    const wallet = await SellerWallet.findOneAndUpdate(
      { shopId: shop._id, balance: { $gte: amount } },
      {
        $inc: { balance: -amount },
        $push: {
          transactions: {
            amount: -amount,
            type: 'withdrawal',
            description: `Withdrawal to ${bankName} (${accountNumber})`,
            status: 'success',
            bankName,
            accountNumber,
            recipientName: req.body.recipientName || req.user.name,
            referenceId,
            createdAt: new Date()
          }
        }
      },
      { new: true } // Return the updated document
    );

    if (!wallet) {
      return res.status(400).json({ error: 'Insufficient balance or wallet not found' });
    }

    res.json({ message: 'Withdrawal successful', wallet });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error processing withdrawal' });
  }
});

// PUT /api/shops/mine/chatbot - Update AI Chatbot settings
router.put('/mine/chatbot', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Seller role required.' });
    }

    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this seller' });
    }

    const { aiChatbotEnabled, aiChatbotPrompt } = req.body;
    
    if (aiChatbotEnabled !== undefined) shop.aiChatbotEnabled = aiChatbotEnabled;
    if (aiChatbotPrompt !== undefined) shop.aiChatbotPrompt = aiChatbotPrompt;

    const updatedShop = await shop.save();
    res.json(updatedShop);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error updating chatbot settings' });
  }
});

// PUT /api/shops/mine/livestream - Update live stream status and URL
router.put('/mine/livestream', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only sellers or admins can manage livestream settings' });
    }

    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this seller' });
    }

    const { isLive, activeStreamUrl } = req.body;
    
    if (isLive !== undefined) shop.isLive = isLive;
    if (activeStreamUrl !== undefined) shop.activeStreamUrl = activeStreamUrl;
    
    const updatedShop = await shop.save();
    
    // Emit updates to clients via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`live_stream:${shop._id}`).emit('LIVESTREAM_STATUS_UPDATE', {
        isLive: shop.isLive,
        activeStreamUrl: shop.activeStreamUrl
      });
      io.emit('GLOBAL_LIVESTREAM_UPDATE', {
        shopId: shop._id,
        isLive: shop.isLive
      });
    }

    res.json(updatedShop);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error updating livestream settings' });
  }
});

// POST /api/shops/:id/live-token - Generate LiveKit token for Host or Viewer
router.post('/:id/live-token', async (req: any, res: Response) => {
  const { role } = req.body; // 'host' or 'viewer'
  const shopId = req.params.id;

  // Optional manual authentication
  let user: any = null;
  let tokenStr: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    tokenStr = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.jwt) {
    tokenStr = req.cookies.jwt;
  }

  if (tokenStr) {
    try {
      const decoded: any = jwt.verify(tokenStr, process.env.JWT_SECRET || 'fallback_secret_stuffy');
      user = await User.findById(decoded.id).select('-password');
    } catch (e) {
      console.warn('[shops live-token] Optional auth token verification failed.');
    }
  }

  // If host, user MUST be logged in and own the shop
  if (role === 'host') {
    if (!user) {
      return res.status(401).json({ error: 'Authentication required for host role' });
    }
    try {
      const shop = await Shop.findById(shopId);
      if (!shop || shop.owner.toString() !== user._id.toString()) {
        return res.status(403).json({ error: 'Only the shop owner can publish livestream' });
      }
    } catch (e) {
      return res.status(500).json({ error: 'Error validating shop ownership' });
    }
  }

  const userName = user ? user.name : 'Guest_' + Math.floor(Math.random() * 10000);
  const userId = user ? user._id.toString() : 'guest_' + Date.now();

  const livekitApiKey = process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL || 'wss://your-livekit-project.livekit.cloud';
  
  if (!livekitApiKey || !livekitApiSecret || livekitApiKey === 'mock_key') {
    // Fallback to local SFU mode
    return res.json({
      useLocalSfu: true,
      shopId,
      role,
      userName
    });
  }
  
  try {
    const identity = `${userId}_${Date.now()}`;
    const roomName = `live_stream:${shopId}`;
    
    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity,
      name: userName
    });
    
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: role === 'host',
      canSubscribe: true,
      canPublishData: true
    });
    
    const token = await at.toJwt();
    
    res.json({
      token,
      url: livekitUrl,
      roomName,
      identity,
      role,
      useLocalSfu: false
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error generating LiveKit token' });
  }
});

export default router;



