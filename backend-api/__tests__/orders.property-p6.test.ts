/**
 * Property-based test for Property 6 (Task 4.6).
 *
 * Verifies the pre-commit rejection gate: when a flash-sale product is ordered
 * with qty GREATER than the available Redis flash-sale stock, the handler
 * returns HTTP 400 BEFORE committing the MongoDB transaction, and NO MongoDB
 * write happens (no Order created, product stock unchanged, seller escrow and
 * buyer coins unchanged).
 *
 * Mechanics: the handler decrements Redis flash-sale stock OUTSIDE/BEFORE the
 * transaction. If Redis stock is already preheated to S < qty, the conditional
 * decrement returns -2 (insufficient) and the handler short-circuits with a 400
 * ("Insufficient stock for Flash Sale product: {name}") before touching Mongo.
 *
 * To make the "Redis is short" scenario unambiguous we:
 *  - preheat Redis stock to S (so the handler does NOT take the -1 preheat path
 *    that would re-seed from Mongo countInStock), and
 *  - keep Mongo countInStock >= qty (so the early read-validation does not
 *    reject first — the rejection must come from the Redis gate).
 *
 * Redis must be mocked BEFORE the orders router is imported (createOrderApp
 * lazily imports it), so the jest.mock call sits at the top of the file.
 */
jest.mock('../services/RedisInventoryService', () =>
  require('./helpers/redisTestHelper').redisMockModule()
);

import fc from 'fast-check';
import type { Express } from 'express';
import * as mongoServer from './helpers/mongoTestServer';
import { redisMockState } from './helpers/redisTestHelper';
import {
  seedBasicScenario,
  makeToken,
  createOrderApp,
  postOrder,
} from './helpers/seed';
import Order from '../models/Order';
import Product from '../models/Product';
import User from '../models/User';
import SellerWallet from '../models/SellerWallet';
import CoinTransaction from '../models/CoinTransaction';
import Promotion from '../models/Promotion';

let app: Express;

const shippingAddress = {
  address: '1 Test Street',
  city: 'Hồ Chí Minh',
  postalCode: '70000',
  country: 'VN',
};

beforeAll(async () => {
  await mongoServer.connect();
  app = await createOrderApp();
});

afterEach(async () => {
  await mongoServer.clearAll();
  redisMockState.reset();
});

afterAll(async () => {
  await mongoServer.disconnect();
});

// Feature: transactional-order-creation, Property 6: Từ chối trước commit khi Redis flash sale không đủ
describe('POST /api/orders — Property 6: pre-commit rejection when Redis flash-sale stock is insufficient', () => {
  it('returns 400 before commit and performs NO MongoDB write when qty > Redis flash-sale stock', async () => {
    await fc.assert(
      fc.asyncProperty(
        // S = available Redis flash-sale stock; qty strictly greater than S so
        // the Redis conditional decrement returns -2 (insufficient).
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        async (S, over) => {
          const qty = S + over; // qty > S guaranteed

          // Clean slate per iteration.
          await mongoServer.clearAll();
          redisMockState.reset();

          // Mongo stock kept >= qty so the early read-validation passes and the
          // rejection is driven purely by the Redis flash-sale gate. Seed an
          // initial wallet escrow and buyer coin balance so we can assert they
          // are left untouched.
          const initialEscrow = 123;
          const initialCoins = 500;
          const { user, shop, product, wallet } = await seedBasicScenario({
            product: { countInStock: qty + 10, price: 100 },
            user: { coinsBalance: initialCoins },
            wallet: { pendingEscrow: initialEscrow },
          });
          const token = makeToken(user._id);

          const flashSale = await Promotion.create({
            shopId: shop._id,
            name: 'Flash Sale',
            type: 'flash_sale',
            discountType: 'percentage',
            discountValue: 10,
            primaryProductId: product._id,
            status: 'active',
            startsAt: new Date(Date.now() - 60_000),
            endsAt: new Date(Date.now() + 3_600_000),
          });

          const promoId = flashSale._id.toString();
          const prodId = product._id.toString();

          // Preheat Redis to S (< qty). This avoids the -1 preheat-from-Mongo
          // path; the decrement will return -2 (insufficient).
          redisMockState.setStock(promoId, prodId, S);

          const body = {
            orderItems: [
              { product: prodId, name: product.name, qty, image: 'x.jpg', price: 100 },
            ],
            shippingAddress,
            paymentMethod: 'COD',
          };

          const res = await postOrder(app, token, body);

          // Rejected with the flash-sale insufficient message, before commit.
          expect(res.status).toBe(400);
          expect(res.body.error).toBe(
            `Insufficient stock for Flash Sale product: ${product.name}`
          );

          // The Redis decrement that returned -2 must have been recorded.
          expect(redisMockState.decrementCalls.length).toBeGreaterThan(0);

          // NO MongoDB write occurred from this request:
          // - no Order persisted,
          expect(await Order.countDocuments()).toBe(0);
          // - no CoinTransaction persisted,
          expect(await CoinTransaction.countDocuments()).toBe(0);
          // - product stock unchanged,
          const reloadedProduct = await Product.findById(product._id);
          expect(reloadedProduct!.countInStock).toBe(qty + 10);
          // - buyer coin balance unchanged,
          const reloadedUser = await User.findById(user._id);
          expect(reloadedUser!.coinsBalance).toBe(initialCoins);
          // - seller escrow unchanged.
          const reloadedWallet = await SellerWallet.findById(wallet._id);
          expect(reloadedWallet!.pendingEscrow).toBe(initialEscrow);
        }
      ),
      { numRuns: 100 }
    );
  });
});
