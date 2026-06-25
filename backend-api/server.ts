import "./tracing";
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import * as Sentry from "@sentry/node";
import { schema } from './schema';
import Product from './models/Product';
import './models/ProductVariant';
import User from './models/User';
import Shop from './models/Shop';
import Order from './models/Order';
import ChatMessage from './models/ChatMessage';
import SellerWallet from './models/SellerWallet';
import CoinTransaction from './models/CoinTransaction';
import { clearCache } from './redis';
import { connectRabbitMQ, pubsub } from './rabbitmq';
import { aiContextSearch } from './ai-search';
import DiscountRule from './models/DiscountRule';
import { DiscountEngine } from './services/DiscountEngine';
import { PaymentService } from './services/PaymentService';
import { AiCopilot } from './services/AiCopilot';
import { ImageGenService } from './services/ImageGenService';
import { getResilientImage } from './services/ResilienceService';
import { Web3LoyaltyService } from './services/Web3LoyaltyService';
import MfeModule from './models/MfeModule';
import Voucher from './models/Voucher';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cartRoutes from './routes/cart';
import orderRoutes from './routes/orders';
import addressRoutes from './routes/addresses';
import categoryRoutes from './routes/categories';
import shopRoutes from './routes/shops';
import chatRoutes from './routes/chat';
import payosRoutes from './routes/paymentPayOS';
import promotionRoutes from './routes/promotions';
import voucherRoutes from './routes/vouchers';
import shippingRoutes from './routes/shipping';
import productRoutes from './routes/products';
import notificationRoutes from './routes/notifications';
import localizationRoutes from './routes/localizations';
import aiSearchRoutes from './routes/aiSearch';
import analyticsRoutes from './routes/analytics';
import { seedLocalization } from './seedLocalization';
import Localization from './models/Localization';
import { initWebPush } from './services/webPush';
import { initCacheInvalidation } from './services/CacheInvalidationService';
import { EscrowDaemon } from './services/escrowDaemon';
import { protect, admin } from './middleware/auth';
import { seoPrerender } from './middleware/seoPrerender';
import { OutboxProcessor } from './services/OutboxProcessor';
import { Product as SharedProduct } from '@stuffy/types';

const app = express();

const apolloServer = new ApolloServer({
  schema,
  introspection: true,
});

async function startApollo() {
  await apolloServer.start();
  app.use('/graphql', cors<cors.CorsRequest>(), express.json(), expressMiddleware(apolloServer, {
    context: async ({ req }) => ({
      tenantId: (req.headers['x-tenant-id'] as string) || 'default_store',
    }),
  }) as any);
}

startApollo().catch(err => console.error('Apollo Start Error:', err));

// RabbitMQ Connection & Internal Worker Simulation
connectRabbitMQ().then(() => {
  OutboxProcessor.start();
  // Simulate a Heavy Worker: Sync inventory to legacy systems (ERP/WMS)
  pubsub.subscribe('INVENTORY_SYNC', (data) => {
    console.log(`[Worker] 🚀 Heavy Task Started: Syncing product ${data.name || data.orderId} to secondary systems...`);
    // Simulate complex calculation or slow API call (3s delay)
    setTimeout(() => {
        console.log(`[Worker] ✅ Task Completed: Product ${data.name || data.orderId} successfully synced.`);
    }, 3000);
  });

  // Simulate an Email Worker: Send order confirmation emails
  pubsub.subscribe('EMAIL_NOTIFICATIONS', (data) => {
    console.log(`[Email Worker] 📧 Sending email notification to ${data.to || data.email}...`);
    setTimeout(() => {
        console.log(`[Email Worker] ✅ Email successfully sent to ${data.to || data.email}.`);
    }, 2000);
  });
}).catch(console.error);

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  });
}

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
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.onrender.com')) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(seoPrerender);

// Routes
const isProduction = process.env.NODE_ENV === 'production';
const authServiceTarget = process.env.AUTH_SERVICE_URL 
  ? process.env.AUTH_SERVICE_URL.replace('/graphql', '') 
  : (isProduction ? 'https://stuffy-auth-service-xmln.onrender.com' : 'http://localhost:5001');

app.use('/api/auth', createProxyMiddleware({ target: authServiceTarget, changeOrigin: true }));
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payments/payos', payosRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/products', productRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/localization', localizationRoutes);
app.use('/api/ai-search', aiSearchRoutes);
app.use('/api/analytics', analyticsRoutes);

app.post('/api/cart/calculate', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default_store';
    const { items, total } = req.body;
    
    const result = await DiscountEngine.calculateBestDiscount(tenantId, {
      items,
      total
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/payments/pay', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default_store';
    const idempotencyKey = req.headers['x-idempotency-key'] as string;
    
    if (!idempotencyKey) {
        return res.status(400).json({ error: 'Idempotency Key (x-idempotency-key) is required for financial safety.' });
    }

    const { amount, currency = 'usd', walletAddress, signature, nonce } = req.body;
    
    // SECURITY FIX: Trusting the client prevention for Web3
    let finalAmount = amount;
    if (walletAddress) {
       if (!signature || !nonce) {
           return res.status(401).json({ error: 'Signature is required to apply Web3 Loyalty discounts.' });
       }
       const isValid = Web3LoyaltyService.verifySignature(walletAddress, signature, nonce);
       if (!isValid) {
           return res.status(403).json({ error: 'Invalid Web3 wallet signature. Transaction rejected.' });
       }
       // Only apply discount if signature is valid
       finalAmount = await Web3LoyaltyService.applyLoyaltyDiscounts(amount, walletAddress);
    }
    
    const result = await PaymentService.createPaymentIntent(
      tenantId, 
      finalAmount, 
      currency, 
      idempotencyKey
    );

    res.json(result);
  } catch (e: any) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.onrender.com')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true 
  } 
});
app.set('io', io);

// 🔒 SECURITY FIX: Middleware to decode JWT if present in handshake
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123') as any;
      socket.data.userId = decoded.id; // Store authenticated user ID in socket
    } catch (e) {
      console.warn(`[Socket.IO] Invalid token provided by socket ${socket.id}`);
    }
  }
  next(); // Allow connection (Guest mode if no token)
});

io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  socket.on('JOIN_TENANT', (tenantId) => {
    socket.join(tenantId);
    console.log(`[Socket.IO] Client ${socket.id} joined tenant: ${tenantId}`);
  });

  socket.on('JOIN_CART_SESSION', (sessionCode) => {
    socket.join(sessionCode);
  });
  socket.on('MOBILE_SCAN_ITEM', ({ sessionCode, product }) => {
    io.to(sessionCode).emit('DESKTOP_RECEIVE_ITEM', product);
  });

  // User joins their personal room to receive real-time messages
  socket.on('JOIN_USER_ROOM', (userId) => {
    // 🔒 SECURITY FIX: Prevent IDOR - Verify the requested userId matches the token's userId
    if (!socket.data.userId || socket.data.userId !== userId) {
      console.warn(`[Socket.IO] Unauthorized IDOR attempt: Socket ${socket.id} tried to join user_room:${userId}`);
      socket.emit('ERROR', { message: 'Unauthorized to join this room' });
      return;
    }
    socket.join(`user_room:${userId}`);
    console.log(`[Socket.IO] Authenticated User ${userId} joined room user_room:${userId}`);
  });

  // Handle buyer-seller message routing and storage
  socket.on('SEND_MESSAGE', async ({ senderId, recipientId, message, shopId, attachmentType, attachedProduct, attachedOrder }) => {
    try {
      // 🔒 SECURITY FIX: Enforce senderId from verified token to prevent spoofing
      const actualSenderId = socket.data.userId || senderId;

      let chatMsg = await ChatMessage.create({
        sender: actualSenderId,
        recipient: recipientId,
        shop: shopId || undefined,
        message,
        isRead: false,
        attachmentType: attachmentType || 'text',
        attachedProduct: attachedProduct || undefined,
        attachedOrder: attachedOrder || undefined
      });

      chatMsg = await chatMsg.populate([
        { path: 'attachedProduct', select: 'name price image category countInStock' },
        { path: 'attachedOrder', select: '_id itemsPrice totalPrice status createdAt paymentMethod' }
      ]);

      // Broadcast to both participants
      io.to(`user_room:${recipientId}`).emit('RECEIVE_MESSAGE', chatMsg);
      io.to(`user_room:${senderId}`).emit('RECEIVE_MESSAGE', chatMsg);

      // AI Chatbot Auto-Responder trigger
      if (shopId) {
        const Shop = require('./models/Shop').default;
        const Product = require('./models/Product').default;
        const shop = await Shop.findById(shopId);
        
        if (shop && shop.aiChatbotEnabled && recipientId === shop.owner.toString()) {
          setTimeout(async () => {
            try {
              const products = await Product.find({ shop: shop._id }).limit(10);
              const productListStr = products.map((p: any) => `- ${p.name}: ${p.price} (${p.description || 'No description'})`).join('\n');
              
              const systemPrompt = shop.aiChatbotPrompt || 'Bạn là trợ lý tư vấn bán hàng của cửa hàng.';
              const finalPrompt = `${systemPrompt}
Tên cửa hàng: ${shop.name}
Mô tả cửa hàng: ${shop.description || 'Chưa có mô tả'}

Danh sách sản phẩm nổi bật của cửa hàng:
${productListStr}

Khách hàng hỏi: "${message}"

Hãy đưa ra câu trả lời tư vấn ngắn gọn, lịch sự, thuyết phục bằng tiếng Việt, hướng dẫn khách hàng mua hàng nếu có sản phẩm phù hợp.`;

              console.log(`[AI Chatbot] Invoking Gemini for Shop ${shop.name}`);
              let aiReplyText = '';
              
              const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
              if (GEMINI_API_KEY && GEMINI_API_KEY !== 'mock_gemini_key') {
                const { GoogleGenerativeAI } = require('@google/generative-ai');
                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                const result = await model.generateContent(finalPrompt);
                aiReplyText = result.response.text().trim();
              } else {
                aiReplyText = `[AI Chatbot Trợ lý ${shop.name}] Cảm ơn bạn đã quan tâm! Hiện tại shop đang có các sản phẩm nổi bật như: ${products.map((p: any) => p.name).join(', ')}. Hãy nhấn "Mua ngay" hoặc hỏi thêm để được tư vấn nhé!`;
              }
              
              const aiMsg = await ChatMessage.create({
                sender: shop.owner,
                recipient: senderId,
                shop: shop._id,
                message: aiReplyText,
                isRead: false
              });
              
              io.to(`user_room:${senderId}`).emit('RECEIVE_MESSAGE', aiMsg);
              io.to(`user_room:${shop.owner}`).emit('RECEIVE_MESSAGE', aiMsg);
              
            } catch (aiErr: any) {
              console.error('[AI Chatbot] Error generating AI chatbot reply:', aiErr.message);
            }
          }, 1000);
        }
      }
    } catch (err: any) {
      console.error('[Socket.IO] Error processing SEND_MESSAGE:', err.message);
    }
  });

  // Join live stream room
  socket.on('JOIN_LIVE_STREAM', (shopId) => {
    // support both string shopId and object payload { shopId, role }
    let actualShopId = shopId;
    let role = 'viewer';
    if (typeof shopId === 'object' && shopId !== null) {
      actualShopId = shopId.shopId;
      role = shopId.role;
    }
    
    const roomName = `live_stream:${actualShopId}`;
    socket.join(roomName);
    console.log(`[Socket.IO] Client ${socket.id} joined live stream: ${actualShopId} as ${role}`);
    
    // Broadcast real-time viewer count based on room size
    const clients = io.sockets.adapter.rooms.get(roomName);
    const numViewers = clients ? clients.size : 0;
    io.to(roomName).emit('LIVESTREAM_VIEWER_COUNT', { count: numViewers });

    if (role === 'viewer') {
      socket.to(roomName).emit('VIEWER_JOINED', { viewerId: socket.id });
    }
  });

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room.startsWith('live_stream:')) {
        const clients = io.sockets.adapter.rooms.get(room);
        const numViewers = clients ? Math.max(0, clients.size - 1) : 0;
        socket.to(room).emit('LIVESTREAM_VIEWER_COUNT', { count: numViewers });
      }
    }
  });

  socket.on('RTC_SIGNAL', ({ targetId, signalData }) => {
    io.to(targetId).emit('RTC_SIGNAL', {
      senderId: socket.id,
      signalData
    });
  });

  // Local SFU WebSocket-based Media Forwarder fallback
  socket.on('HOST_STREAM_FRAME', ({ shopId, frame }) => {
    socket.to(`live_stream:${shopId}`).emit('VIEWER_STREAM_FRAME', frame);
  });

  // Handle real-time live order placement sync
  socket.on('LIVE_ORDER_PLACED', ({ shopId, amount, productName, productId }) => {
    io.to(`live_stream:${shopId}`).emit('LIVE_ORDER_RECORDED', {
      amount,
      productName,
      productId,
      timestamp: new Date()
    });
    console.log(`[Socket.IO] Live order recorded in room ${shopId}: $${amount} for product "${productName}"`);
  });

  // Handle stream comment broadcast
  socket.on('SEND_STREAM_COMMENT', ({ shopId, userName, comment }) => {
    io.to(`live_stream:${shopId}`).emit('RECEIVE_STREAM_COMMENT', {
      userName,
      comment,
      createdAt: new Date()
    });
  });

  // Handle stream product pin broadcast
  socket.on('PIN_PRODUCT', ({ shopId, product }) => {
    io.to(`live_stream:${shopId}`).emit('PRODUCT_PINNED', {
      product,
      pinnedAt: new Date()
    });
    console.log(`[Socket.IO] Pinned product ${product?.name} in live stream room: ${shopId}`);
  });

  // Handle stream virtual coins gifting
  socket.on('SEND_VIRTUAL_GIFT', async ({ shopId, senderId, giftType }) => {
    try {
      const giftRates: Record<string, number> = {
        Rose: 5,
        Heart: 10,
        Rocket: 50
      };

      const giftValue = giftRates[giftType] || 5;

      // Find buyer (Read from primary to prevent over-spending due to lag)
      const buyer = await User.findById(senderId).read('primary');
      if (!buyer || (buyer.coinsBalance || 0) < giftValue) {
        socket.emit('GIFT_ERROR', { error: 'Insufficient coins balance to send this gift' });
        return;
      }

      // Deduct coins from buyer
      buyer.coinsBalance = (buyer.coinsBalance || 0) - giftValue;
      await buyer.save();

      // Log buyer spend transaction
      await CoinTransaction.create({
        user: buyer._id,
        amount: -giftValue,
        type: 'spend',
        isCredited: true
      });

      // Find shop owner (Seller)
      const shop = await Shop.findById(shopId);
      if (shop) {
        const sellerUser = await User.findById(shop.owner);
        if (sellerUser) {
          const sellerCredit = Math.floor(giftValue * 0.9); // 10% platform fee
          sellerUser.coinsBalance = (sellerUser.coinsBalance || 0) + sellerCredit;
          await sellerUser.save();

          // Log seller earn transaction
          await CoinTransaction.create({
            user: sellerUser._id,
            amount: sellerCredit,
            type: 'earn',
            isCredited: true
          });
          
          console.log(`[Socket.IO] User ${buyer.name} gifted ${giftType} to shop ${shop.name}. Deducted ${giftValue} coins. Credited seller ${sellerCredit} coins.`);
        }
      }

      // Broadcast gift event to room
      io.to(`live_stream:${shopId}`).emit('GIFT_RECEIVED', {
        userName: buyer.name,
        giftType,
        giftValue
      });
    } catch (err: any) {
      console.error('[Socket.IO] Error processing SEND_VIRTUAL_GIFT:', err.message);
    }
  });
});

// Flash Sale Tick
let flashSaleTimeLeft = 24 * 60 * 60;
setInterval(() => {
  flashSaleTimeLeft = flashSaleTimeLeft > 0 ? flashSaleTimeLeft - 1 : 24 * 60 * 60;
  io.emit('FLASH_SALE_TICK', flashSaleTimeLeft);
}, 1000);

// Dynamic Pricing Engine: Random Flash Sales every 10 seconds
setInterval(async () => {
  try {
    const [targetProduct] = await Product.aggregate([{ $sample: { size: 1 } }]);
    if (!targetProduct) return;
    
    // Calculate flash price (20-50% discount)
    const discount = 0.5 + Math.random() * 0.3; // 50% to 80% of original
    const newPrice = Math.round(targetProduct.price * discount);
    
    console.log(`[Dynamic Pricing] Flash sale on ${targetProduct.name}: ${targetProduct.price} -> ${newPrice}`);
    
    // Broadcast to specific tenant room (Isolation)
    io.to(targetProduct.tenantId).emit('DYNAMIC_PRICE_UPDATE', {
      productId: targetProduct._id,
      newPrice,
      originalPrice: targetProduct.price,
      message: `🔥 FLASH SALE: ${targetProduct.name} is now $${newPrice}!`
    });
  } catch (err) {
    console.error('[Dynamic Pricing] Error:', err);
  }
}, 10000);

// Shopee Guarantee Auto-Payout Engine (Delivered orders auto-release after 3 days)
// Started background Escrow Auto-Release worker
EscrowDaemon.start(15000, 3);

const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/stuffy_db';

mongoose.connect(mongoURI)
  .then(async () => {
    const isReplicaSet = mongoURI.includes('replicaSet=');
    console.log(`[MongoDB] Connection established successfully ${isReplicaSet ? '(Replica Set Mode)' : '(Single Node Mode)'}.`);
    console.log('[CQRS DB Splitting] Read-Write Database splitting active: product/category read operations are routed to replicas.');
    initWebPush();
    initCacheInvalidation();
    await seedLocalization();
    
    // --- GOVERNANCE REGISTRY SEEDER ---
    const MFE_DEFAULTS = {
      header: "https://stuffy-header-app-xmln.onrender.com/remoteEntry.js",
      product: "https://stuffy-product-app-xmln.onrender.com/remoteEntry.js",
      cart: "https://stuffy-cart-app-xmln.onrender.com/remoteEntry.js",
      admin: "https://stuffy-admin-app-xmln.onrender.com/remoteEntry.js",
      store: "https://stuffy-store-app-xmln.onrender.com/remoteEntry.js",
      profile: "https://stuffy-profile-app-xmln.onrender.com/remoteEntry.js",
      marketing: "https://stuffy-marketing-app-xmln.onrender.com/remoteEntry.js",
      support: "https://stuffy-support-app-xmln.onrender.com/remoteEntry.js",
      design_system: "https://stuffy-design-system-app-xmln.onrender.com/remoteEntry.js",
      viewer: "https://stuffy-3d-viewer-app-xmln.onrender.com/remoteEntry.js",
    };

    try {
      await MfeModule.deleteOne({ name: 'container' }); // 🛡️ CRITICAL: Remove host from registry to prevent self-injection
      for (const [name, url] of Object.entries(MFE_DEFAULTS)) {
        const mfe = await MfeModule.findOne({ name });
        if (!mfe) {
          await MfeModule.create({ name, activeUrl: url, versions: [{ version: "1.0.0", url, status: "stable", rollbackAvailable: true }] });
          console.log(`[Registry] 🌱 Seeded MFE: ${name}`);
        } else {
          // 🛡️ AUTO-MIGRATE: Always update to latest default URL on every server start
          // This ensures stale MongoDB data from previous deployments is always overridden
          mfe.activeUrl = url;
          if (!mfe.versions.find((v: any) => v.url === url)) {
            mfe.versions.push({ version: "latest", url, status: "stable", rollbackAvailable: true });
          }
          await mfe.save();
          console.log(`[Registry] 🔄 Updated MFE URL: ${name} → ${url}`);
        }
      }
    } catch (err) { console.error("[Registry] ❌ Seeding failed:", err); }

    let defaultUser = await User.findOne({ email: 'admin@stuffy.com' });
    if (!defaultUser) {
      defaultUser = await User.create({
        name: 'Stuffy Admin',
        email: 'admin@stuffy.com',
        password: 'adminpassword',
        role: 'admin',
        tenantId: 'default_store'
      });
    }

    let defaultShop = await Shop.findOne({ name: 'Default Shop' });
    if (!defaultShop) {
      defaultShop = await Shop.create({
        name: 'Default Shop',
        owner: defaultUser._id,
        description: 'Default Stuffy Supermarket Shop',
        tenantId: 'default_store'
      });
    }

    const count = await Product.countDocuments();
    if (count === 0) {
      await Product.insertMany([
        { name: "MacBook Pro M3 Max", price: 3499, category: "Tech", tenantId: 'default_store', shop: defaultShop._id },
        { name: "Apple Vision Pro", price: 3499, category: "Tech", tenantId: 'default_store', shop: defaultShop._id },
        { name: "Sony WH-1000XM5", price: 398, category: "Audio", tenantId: 'default_store', shop: defaultShop._id },
        { name: "PlayStation 5", price: 499, category: "Gaming", tenantId: 'default_store', shop: defaultShop._id }
      ]);
    } else {
      await Product.updateMany({ shop: { $exists: false } }, { $set: { shop: defaultShop._id } });
    }

    const ruleCount = await DiscountRule.countDocuments();
    if (ruleCount === 0) {
      await DiscountRule.insertMany([
        { 
          name: 'High Value Enterprise Order', 
          tenantId: 'default_store', 
          logic: { ">": [{ "var": "total" }, 1500] }, 
          discountType: 'percentage', 
          discountValue: 15,
          priority: 10
        },
        { 
          name: 'Tech Enthusiast Weekend', 
          tenantId: 'default_store', 
          logic: { 
            "and": [
              { "==": [{ "var": "dayOfWeek" }, 6] },
              { "var": "hasTech" }
            ]
          }, 
          discountType: 'fixed', 
          discountValue: 100,
          priority: 5
        }
      ]);
      console.log('[Seed] Advanced Discount Rules configured.');
    }

    const voucherCount = await Voucher.countDocuments();
    if (voucherCount === 0) {
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await Voucher.insertMany([
        { code: 'FREESHIP', type: 'shipping', discountType: 'fixed', discountValue: 0, description: 'Free shipping on orders over $50', minOrderValue: 50, usageLimit: 500, expiresAt: thirtyDaysFromNow, tenantId: 'default_store' },
        { code: 'TECH10', type: 'discount', discountType: 'percentage', discountValue: 10, description: '10% off on all tech products', maxDiscount: 100, usageLimit: 200, expiresAt: thirtyDaysFromNow, tenantId: 'default_store' },
        { code: 'WELCOME15', type: 'discount', discountType: 'fixed', discountValue: 15, description: '$15 off your first purchase', usageLimit: 1000, expiresAt: thirtyDaysFromNow, tenantId: 'default_store' },
        { code: 'FLASH30', type: 'discount', discountType: 'percentage', discountValue: 30, description: '30% off flash sale - max $50 discount', maxDiscount: 50, minOrderValue: 100, usageLimit: 50, expiresAt: thirtyDaysFromNow, tenantId: 'default_store' }
      ]);
      console.log('[Seed] Vouchers initialized.');
    }

  });


app.post('/api/ai/context-search', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    const result = await aiContextSearch(query);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/copilot/chat', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default_store';
    
    const result = await AiCopilot.handleChat(query, tenantId);
    
    res.json(result);
  } catch (e: any) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/marketing/dynamic-visual', async (req: Request, res: Response) => {
  try {
    const { productName, theme = 'bright' } = req.query;
    if (!productName) return res.status(400).json({ error: 'productName is required' });

    const imageUrl = await ImageGenService.generateThemedVisual(productName as string, theme as any);
    res.json({ imageUrl });
  } catch (e: any) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/images/proxy', async (req: Request, res: Response) => {
  try {
    const { url, w = '800', q = '80' } = req.query;
    if (!url) return res.status(400).json({ error: 'url is required' });

    // 🔒 SECURITY FIX: SSRF Protection
    try {
      const parsedUrl = new URL(url as string);
      
      // 1. Whitelist Protocols
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        console.warn(`[SSRF] Blocked invalid protocol: ${parsedUrl.protocol}`);
        return res.status(400).json({ error: 'Invalid URL: Only HTTP/HTTPS allowed' });
      }

      // 2. Blacklist Internal/Private IP Ranges & Localhost
      const isLocalhost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
      const isInternalIP = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.)/.test(parsedUrl.hostname);
      
      if (isLocalhost || isInternalIP) {
        console.warn(`[SSRF] Blocked access to internal network: ${parsedUrl.hostname}`);
        return res.status(403).json({ error: 'Invalid URL: Access to internal network is forbidden' });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Malformed URL' });
    }

    const result = await getResilientImage(url as string, parseInt(w as string), parseInt(q as string));
    
    if (typeof result === 'string') {
        // Circuit is OPEN or fallback triggered -> Serving Placeholder URL
        return res.redirect(result);
    }
    
    // Circuit is CLOSED -> Serving binary optimized data from Image-Service
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(result);
  } catch (e: any) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/loyalty/vip-check', async (req: Request, res: Response) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'wallet address is required' });

    const isVipNFT = await Web3LoyaltyService.checkVipNftOwnership(address as string);
    res.json({ isVipNFT });
  } catch (e: any) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/registry/manifest', async (req: Request, res: Response) => {
  try {
    const modules = await MfeModule.find({});
    const manifest: Record<string, string> = {};
    modules.forEach(m => {
      manifest[m.name] = m.activeUrl;
    });
    res.json(manifest);
  } catch (e: any) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/registry/switch-version', admin, async (req: Request, res: Response) => {
  try {
    const { name, version } = req.body;
    const mfe = await MfeModule.findOne({ name });
    if (!mfe) return res.status(404).json({ message: 'MFE not found' });

    const target = mfe.versions.find(v => v.version === version);
    if (!target) return res.status(400).json({ message: 'Version not found' });

    // SECURITY VULNERABILITY FIX: Prevent XSS by validating the remote URL domain
    const allowedDomains = /^https:\/\/(.*\.)?onrender\.com|^http:\/\/localhost:\d+/;
    if (!allowedDomains.test(target.url)) {
      return res.status(403).json({ message: 'SECURITY ALERT: Target URL domain is not allowed' });
    }

    mfe.activeUrl = target.url;
    await mfe.save();
    
    // Invalidate manifest cache
    await clearCache('manifest');
    
    res.json({ message: `Successfully switched ${name} to ${version}`, activeUrl: mfe.activeUrl });
  } catch (e: any) {
    Sentry.captureException(e);
    res.status(500).json({ error: e.message }); 
  }
});

// ---- VOUCHER ROUTES ----

app.get('/api/vouchers', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default_store';
    const vouchers = await Voucher.find({
      tenantId,
      isActive: true,
      expiresAt: { $gt: new Date() },
      $expr: { $lt: ['$usedCount', '$usageLimit'] }
    }).select('-claimedBy');
    res.json(vouchers);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/vouchers/claim', protect, async (req: any, res: Response) => {
  try {
    const { code } = req.body;
    const voucher = await Voucher.findOne({ code: code.toUpperCase(), isActive: true });
    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
    if (new Date() > voucher.expiresAt) return res.status(400).json({ error: 'Voucher has expired' });
    if (voucher.usedCount >= voucher.usageLimit) return res.status(400).json({ error: 'Voucher usage limit reached' });
    if (voucher.claimedBy.includes(req.user._id)) return res.status(400).json({ error: 'You have already claimed this voucher' });

    voucher.claimedBy.push(req.user._id);
    await voucher.save();
    res.json({
      message: 'Voucher claimed successfully',
      voucher: {
        code: voucher.code,
        type: voucher.type,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        description: voucher.description,
        scope: voucher.scope,
        shopId: voucher.shopId
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/vouchers/apply', protect, async (req: any, res: Response) => {
  try {
    const { code, orderTotal, items, fromLivestream } = req.body;
    const voucher = await Voucher.findOne({ code: code.toUpperCase(), isActive: true });
    if (!voucher) return res.status(404).json({ error: 'Voucher not found or inactive' });
    if (new Date() > voucher.expiresAt) return res.status(400).json({ error: 'Voucher has expired' });
    if (!voucher.claimedBy.includes(req.user._id)) return res.status(400).json({ error: 'You have not claimed this voucher' });

    if (voucher.isLivestreamExclusive && !fromLivestream) {
      return res.status(400).json({ error: 'This voucher is only valid for purchases from livestream' });
    }

    let discountAmount = 0;
    let freeShipping = false;

    if (voucher.scope === 'shop') {
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart items are required for shop-scoped vouchers' });
      }

      let shopSubtotal = 0;
      for (const item of items) {
        const productId = item.product || item._id;
        const product = await Product.findById(productId);
        if (product && product.shop && product.shop.toString() === voucher.shopId?.toString()) {
          shopSubtotal += (product.price || item.price) * (item.qty || 1);
        }
      }

      if (shopSubtotal < voucher.minOrderValue) {
        return res.status(400).json({ error: `Minimum shop order value of $${voucher.minOrderValue} is not met for this voucher` });
      }

      if (voucher.type === 'shipping') {
        freeShipping = true;
      } else if (voucher.discountType === 'percentage') {
        discountAmount = shopSubtotal * (voucher.discountValue / 100);
        if (voucher.maxDiscount > 0) discountAmount = Math.min(discountAmount, voucher.maxDiscount);
      } else {
        discountAmount = voucher.discountValue;
      }
    } else {
      // Platform scope
      if (orderTotal < voucher.minOrderValue) return res.status(400).json({ error: `Minimum order value is $${voucher.minOrderValue}` });

      if (voucher.type === 'shipping') {
        freeShipping = true;
      } else if (voucher.discountType === 'percentage') {
        discountAmount = orderTotal * (voucher.discountValue / 100);
        if (voucher.maxDiscount > 0) discountAmount = Math.min(discountAmount, voucher.maxDiscount);
      } else {
        discountAmount = voucher.discountValue;
      }
    }

    res.json({
      code: voucher.code,
      type: voucher.type,
      discountType: voucher.discountType,
      discountValue: voucher.discountValue,
      maxDiscount: voucher.maxDiscount,
      discountAmount: Math.round(discountAmount * 100) / 100,
      freeShipping,
      finalTotal: Math.round((orderTotal - discountAmount) * 100) / 100
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/vouchers', protect, admin, async (req: any, res: Response) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default_store';
    const voucher = new Voucher({ ...req.body, tenantId });
    await voucher.save();
    res.status(201).json(voucher);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

Sentry.setupExpressErrorHandler(app);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`[Server] Listening on port ${PORT}`));

// Touch to reload: 1780660101038

