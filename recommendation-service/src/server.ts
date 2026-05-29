import express, { type Request, type Response, type NextFunction } from 'express';
import { createClient } from 'redis';
import amqp from 'amqplib';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();
const app = express();
const INTERNAL_SECRET = process.env.STUFFY_INTERNAL_SECRET || 'stuffy_secret_2026';

/**
 * 🛡️ ZERO TRUST MIDDLEWARE
 */
const interServiceAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['x-internal-service-auth'] as string;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized Inter-Service Call' });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Broken Service Auth Token' });
    
    try {
        jwt.verify(token, INTERNAL_SECRET as string);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid Internal Service Token' });
    }
};

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:3006',
  'https://stuffy-container.onrender.com',
  'https://stuffy-store-app.onrender.com',
  'https://stuffy-header-app.onrender.com',
  'https://stuffy-product-app.onrender.com',
  'https://stuffy-cart-app.onrender.com',
  'https://stuffy-admin-app.onrender.com',
  'https://stuffy-profile-app.onrender.com',
  'https://stuffy-marketing-app.onrender.com',
  'https://stuffy-support-app.onrender.com',
  'https://stuffy-3d-viewer-app.onrender.com',
  'https://stuffy-design-system-app.onrender.com',
];

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(express.json());

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const RABBIT_URL = process.env.RABBIT_URL || 'amqp://localhost';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/stuffy_db';

const redis = createClient({ 
    url: REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.warn('[Redis] 🛑 Maximum reconnection attempts reached. Giving up.');
                return false; // Stop retrying
            }
            return Math.min(retries * 100, 3000); // Exponential backoff
        }
    }
});

redis.on('error', (err) => console.error('[Redis] ❌ Connection Error:', err));

// Secure Connection Logic (Non-blocking crash prevention)
const connectServices = async () => {
    try {
        await redis.connect();
        console.log('[Redis] ✅ Connected successfully.');
    } catch (e) {
        console.error('[Redis] ⚠️ Fallback: Continuing without Redis. Some features will be limited.');
    }
};

connectServices();

// 1. RECOMMENDATION ENGINE (Collaborative Filtering Logic)
async function trackInteraction(userId: string, productId: string) {
    console.log(`[Recom] 📈 Tracking click for User ${userId} on Product ${productId}`);
    
    // Simple Collaborative Filtering: 
    // If we view Product A, what else have OTHER users viewed alongside it?
    // We store the 'User -> [Products]' set in Redis.
    await redis.sAdd(`user_views:${userId}`, productId);
    
    // We also correlate the current product with any previously viewed by this user
    const userHistory = await redis.sMembers(`user_views:${userId}`);
    for (const historicId of userHistory) {
        if (historicId !== productId) {
            // "People who viewed P1 also viewed P2"
            await redis.zIncrBy(`correlations:${productId}`, 1, historicId);
            await redis.zIncrBy(`correlations:${historicId}`, 1, productId);
        }
    }
}

// 2. RABBITMQ CONSUMER (Real-time Event Processing)
async function startConsumer() {
    try {
        if (!process.env.RABBIT_URL) {
            console.warn("[Amqp] ⚠️ Missing RABBIT_URL. Consumer not started.");
            return;
        }
        const conn = await amqp.connect(RABBIT_URL);
        const channel = await conn.createChannel();
        const queue = 'user_behavior_tracking';
        
        await channel.assertQueue(queue, { durable: true });
        console.log(`[Recom] 🐰 Listening for behaviors on: ${queue}`);

        channel.consume(queue, (msg) => {
            if (msg) {
                const { userId, productId } = JSON.parse(msg.content.toString());
                trackInteraction(userId, productId).catch(e => console.error(e));
                channel.ack(msg);
            }
        });
    } catch (err) { 
        console.error('[RabbitMQ] ❌ Failure: Service will operate without real-time tracking.', err);
    }
}

// 3. RECOMMENDATION API
app.get('/api/recommendations/:id', async (req, res) => {
    const productId = req.params.id;
    // Get Top 4 correlated products from Redis Sorted Set
    const recommendations = await redis.zRangeWithScores(`correlations:${productId}`, 0, 3, { REV: true });
    
    // In a real app, we'd fetch names/images from DB here or provide IDs
    res.json({
        productId,
        suggested: recommendations.map(r => ({ id: r.value, score: r.score }))
    });
});

const PORT = process.env.PORT || 3010;
app.listen(Number(PORT), () => {
    console.log(`[Recom] 🚀 Recommendation Microservice is LIVE on port ${PORT}`);
    startConsumer();
});
