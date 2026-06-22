import express, { Response } from 'express';
import { protect } from '../middleware/auth';
import PushSubscription from '../models/PushSubscription';
import { getVapidPublicKey, sendPushNotification } from '../services/webPush';

const router = express.Router();

// GET /api/notifications/vapid-public-key
router.get('/vapid-public-key', (req: any, res: Response) => {
  try {
    const publicKey = getVapidPublicKey();
    res.json({ publicKey });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notifications/subscribe
router.post('/subscribe', protect, async (req: any, res: Response) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({ error: 'Subscription object with endpoint and keys is required' });
    }

    // Check if subscription already exists for this user
    const existing = await PushSubscription.findOne({
      user: req.user._id,
      'subscription.endpoint': subscription.endpoint
    });

    if (existing) {
      return res.status(200).json({ message: 'Subscription already registered', subscription: existing });
    }

    const newSub = await PushSubscription.create({
      user: req.user._id,
      subscription
    });

    console.log(`[WebPush] Registered new subscription for user ${req.user.name} (${req.user._id})`);
    res.status(201).json({ message: 'Subscription registered successfully', subscription: newSub });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notifications/send-test
router.post('/send-test', protect, async (req: any, res: Response) => {
  try {
    const { title = 'Stuffy Supermarket', message = 'Đây là thông báo thử nghiệm ngoại tuyến!' } = req.body;
    await sendPushNotification(req.user._id.toString(), title, message);
    res.json({ message: 'Test push notification triggered' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
