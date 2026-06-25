import express, { type Request, type Response, type NextFunction } from 'express';
import { createClient } from 'redis';
import amqp from 'amqplib';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();
const app = express();
const INTERNAL_SECRET = process.env.STUFFY_INTERNAL_SECRET || 'stuffy_secret_2026';

// Initialize Google Gemini AI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
let genAI: GoogleGenerativeAI | null = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== 'mock_gemini_key') {
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        console.log('[Gemini] Initialized successfully with API Key.');
    } catch (err: any) {
        console.error('[Gemini] Initialization failed:', err.message);
    }
} else {
    console.log('[Gemini] Running in FALLBACK mode. No valid GEMINI_API_KEY found.');
}

/**
 * [Shield] ZERO TRUST MIDDLEWARE
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

app.use(cors());
app.use(express.json());

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const RABBIT_URL = process.env.RABBIT_URL || 'amqp://localhost';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/stuffy_db';

const redis = createClient({ 
    url: REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
console.warn('[Redis] [Stop] Maximum reconnection attempts reached. Giving up.');
                return false; // Stop retrying
            }
            return Math.min(retries * 100, 3000); // Exponential backoff
        }
    }
});

redis.on('error', (err) => console.error('[Redis] [X] Connection Error:', err));

// Secure Connection Logic (Non-blocking crash prevention)
const connectServices = async () => {
    try {
        await redis.connect();
console.log('[Redis] [OK] Connected successfully.');
    } catch (e) {
console.error('[Redis] [Warn] Fallback: Continuing without Redis. Some features will be limited.');
    }
};

connectServices();

// 1. RECOMMENDATION ENGINE (Collaborative Filtering Logic)
async function trackInteraction(userId: string, productId: string) {
    if (!redis.isOpen) {
        console.warn('[Recom] Redis is not open/connected. Skipping tracking.');
        return;
    }
console.log(`[Recom] [Up] Tracking click for User ${userId} on Product ${productId}`);
    
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

// Helper to query Gemini AI for product suggestions
async function getGeminiRecommendations(productId: string, redisCorrelations: { id: string; score: number }[]): Promise<{ id: string; score: number }[]> {
    if (!genAI) {
        throw new Error('Gemini API client not initialized');
    }
    
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
    });
    
    const prompt = `
    You are a machine learning product recommendation engine for Stuffy Supermarket.
    Given a target product ID: "${productId}"
    And a list of correlated products viewed alongside it from user clickstream data:
    ${JSON.stringify(redisCorrelations, null, 2)}
    
    Task:
    Analyze the relationships and re-score or refine the recommendations to deliver the most relevant experience.
    Return the result strictly in this JSON format:
    {
      "suggested": [
        { "id": "product_id", "score": number }
      ]
    }
    Make sure to only suggest items from the correlated list or related IDs.
    `;
    
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);
    return parsed.suggested || [];
}

// 2. RABBITMQ CONSUMER (Real-time Event Processing)
async function startConsumer() {
    try {
        if (!process.env.RABBIT_URL) {
console.warn("[Amqp] [Warn] Missing RABBIT_URL. Consumer not started.");
            return;
        }
        const conn = await amqp.connect(RABBIT_URL);
        const channel = await conn.createChannel();
        const queue = 'user_behavior_tracking_v2';
        
        await channel.assertQueue(queue, { durable: true });
console.log(`[Recom] [Rabbit] Listening for behaviors on: ${queue}`);

        channel.consume(queue, (msg) => {
            if (msg) {
                const { userId, productId } = JSON.parse(msg.content.toString());
                trackInteraction(userId, productId).catch(e => console.error(e));
                channel.ack(msg);
            }
        });
    } catch (err) { 
console.error('[RabbitMQ] [X] Failure: Service will operate without real-time tracking.', err);
    }
}

// 3. RECOMMENDATION API
app.get('/api/recommendations/:id', async (req, res) => {
    const productId = req.params.id;
    if (!redis.isOpen) {
        console.warn('[Recom] Redis is not open/connected. Returning fallback empty array.');
        return res.json({
            productId,
            suggested: []
        });
    }
    try {
        // Get Top 4 correlated products from Redis Sorted Set
        const recommendations = await redis.zRangeWithScores(`correlations:${productId}`, 0, 3, { REV: true });
        const redisCorrelations = recommendations.map(r => ({ id: r.value, score: r.score }));

        if (genAI) {
            try {
                console.log(`[Recom] Generating AI recommendations using Gemini for Product ${productId}`);
                const aiSuggestions = await getGeminiRecommendations(productId, redisCorrelations);
                return res.json({
                    productId,
                    suggested: aiSuggestions,
                    engine: 'Gemini AI'
                });
            } catch (aiErr: any) {
                console.warn('[Recom] Gemini AI recommendation failed. Falling back to Redis collaborative filtering:', aiErr.message);
            }
        }
        
        res.json({
            productId,
            suggested: redisCorrelations,
            engine: 'Redis Collaborative Filtering'
        });
    } catch (error: any) {
        console.error('[Recom] Error getting recommendations:', error.message);
        res.json({
            productId,
            suggested: []
        });
    }
});

const PORT = process.env.PORT || 3010;
app.listen(Number(PORT), () => {
console.log(`[Recom] [Rocket] Recommendation Microservice is LIVE on port ${PORT}`);
    startConsumer();
});
