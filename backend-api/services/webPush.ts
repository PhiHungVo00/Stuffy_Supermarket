import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import PushSubscription from '../models/PushSubscription';

const keysPath = path.join(__dirname, '../vapid-keys.json');
let vapidKeys: { publicKey: string; privateKey: string };

if (fs.existsSync(keysPath)) {
  try {
    vapidKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  } catch (err) {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(keysPath, JSON.stringify(vapidKeys, null, 2));
  }
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(keysPath, JSON.stringify(vapidKeys, null, 2));
}

export const getVapidPublicKey = () => vapidKeys.publicKey;

export const initWebPush = () => {
  webpush.setVapidDetails(
    'mailto:admin@stuffysupermarket.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  console.log('[WebPush] Service initialized successfully.');
};

export const sendPushNotification = async (userId: string, title: string, message: string) => {
  try {
    const subscriptions = await PushSubscription.find({ user: userId });
    console.log(`[WebPush] Found ${subscriptions.length} subscription(s) for user ${userId}`);
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({ title, message });

    const pushPromises = subscriptions.map((sub: any) => {
      const pushSubscription = {
        endpoint: sub.subscription.endpoint,
        keys: {
          p256dh: sub.subscription.keys.p256dh,
          auth: sub.subscription.keys.auth
        }
      };
      return webpush.sendNotification(pushSubscription, payload)
        .then(() => {
          console.log(`[WebPush] Notification sent successfully to endpoint: ${sub.subscription.endpoint.slice(0, 30)}...`);
        })
        .catch(async (err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await PushSubscription.deleteOne({ _id: sub._id });
            console.log(`[WebPush] Removed expired subscription ${sub._id}`);
          } else {
            console.error(`[WebPush] Error sending notification to subscription:`, err.message);
          }
        });
    });

    await Promise.all(pushPromises);
  } catch (error: any) {
    console.error('[WebPush] Error in sendPushNotification:', error.message);
  }
};
