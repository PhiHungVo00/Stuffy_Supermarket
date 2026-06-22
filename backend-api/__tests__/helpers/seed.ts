/**
 * Test data seeding + order-handler invocation helpers.
 *
 * Provides small builders for the documents the order-creation flow touches
 * (User, Shop, Product, SellerWallet) and a way to call `POST /api/orders`
 * against a minimal Express app that mounts the real orders router.
 *
 * IMPORTANT: `createOrderApp()` lazily imports `routes/orders`, which depends
 * on `RedisInventoryService`. Tests that call the handler should mock that
 * service first (see redisTestHelper) so no real Redis connection is opened:
 *
 *   jest.mock('../../services/RedisInventoryService', () =>
 *     require('../helpers/redisTestHelper').redisMockModule());
 */
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';
import User from '../../models/User';
import Shop from '../../models/Shop';
import Product from '../../models/Product';
import SellerWallet from '../../models/SellerWallet';

let userCounter = 0;
let shopCounter = 0;

export interface SeededScenario {
  user: any;
  shop: any;
  product: any;
  wallet: any;
}

/** Create a User. First user created in a fresh DB is fine as a plain buyer. */
export async function seedUser(overrides: Record<string, any> = {}): Promise<any> {
  userCounter += 1;
  return User.create({
    name: overrides.name ?? `Test User ${userCounter}`,
    email: overrides.email ?? `user${userCounter}_${Date.now()}@test.local`,
    password: overrides.password ?? 'password123',
    role: overrides.role ?? 'user',
    tenantId: overrides.tenantId ?? 'default_store',
    coinsBalance: overrides.coinsBalance ?? 0,
    ...overrides,
  });
}

/** Create a Shop owned by `ownerId`. */
export async function seedShop(ownerId: mongoose.Types.ObjectId | string, overrides: Record<string, any> = {}): Promise<any> {
  shopCounter += 1;
  return Shop.create({
    name: overrides.name ?? `Test Shop ${shopCounter}_${Date.now()}`,
    owner: ownerId,
    description: overrides.description ?? 'A test shop',
    tenantId: overrides.tenantId ?? 'default_store',
    ...overrides,
  });
}

/** Create a Product belonging to `shopId`. */
export async function seedProduct(shopId: mongoose.Types.ObjectId | string, overrides: Record<string, any> = {}): Promise<any> {
  return Product.create({
    name: overrides.name ?? 'Test Product',
    price: overrides.price ?? 100,
    category: overrides.category ?? 'Tech',
    countInStock: overrides.countInStock ?? 50,
    image: overrides.image ?? 'test.jpg',
    shop: shopId,
    tenantId: overrides.tenantId ?? 'default_store',
    ...overrides,
  });
}

/** Create a SellerWallet for `shopId`. */
export async function seedWallet(shopId: mongoose.Types.ObjectId | string, overrides: Record<string, any> = {}): Promise<any> {
  return SellerWallet.create({
    shopId,
    balance: overrides.balance ?? 0,
    pendingEscrow: overrides.pendingEscrow ?? 0,
    currency: overrides.currency ?? 'USD',
    ...overrides,
  });
}

/**
 * Seed a complete minimal scenario: one buyer, one shop with a wallet, and
 * one in-stock product in that shop.
 */
export async function seedBasicScenario(overrides: {
  user?: Record<string, any>;
  shop?: Record<string, any>;
  product?: Record<string, any>;
  wallet?: Record<string, any>;
} = {}): Promise<SeededScenario> {
  const user = await seedUser(overrides.user);
  const owner = await seedUser({ role: 'seller', ...(overrides.shop?.ownerOverrides ?? {}) });
  const shop = await seedShop(owner._id, overrides.shop);
  const product = await seedProduct(shop._id, overrides.product);
  const wallet = await seedWallet(shop._id, overrides.wallet);
  return { user, shop, product, wallet };
}

/** Generate a JWT the auth middleware (`protect`) will accept for `userId`. */
export function makeToken(userId: mongoose.Types.ObjectId | string): string {
  return jwt.sign({ id: userId.toString() }, process.env.JWT_SECRET || 'test_secret_stuffy', {
    expiresIn: '1h',
  });
}

/**
 * Build a minimal Express app that mounts the real orders router at
 * `/api/orders`. Lazily imports the router so callers can install mocks
 * (e.g. RedisInventoryService) beforehand.
 */
export async function createOrderApp(): Promise<Express> {
  const express = (await import('express')).default;
  const cookieParser = (await import('cookie-parser')).default;
  const orderRoutes = (await import('../../routes/orders')).default;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/orders', orderRoutes);
  return app;
}

/**
 * Convenience wrapper around supertest for `POST /api/orders`.
 * Returns the supertest response.
 */
export async function postOrder(app: Express, token: string, body: Record<string, any>) {
  const request = (await import('supertest')).default;
  return request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}
