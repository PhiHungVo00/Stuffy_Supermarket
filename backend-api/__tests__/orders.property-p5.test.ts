/**
 * Property-based test for Property 5 (Task 4.5).
 *
 * Verifies Redis–MongoDB consistency on abort: when a MongoDB transaction
 * aborts AFTER flash-sale stock has already been decremented in Redis, the
 * Redis flash-sale stock is restored to its original value.
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

// Feature: transactional-order-creation, Property 5: Nhất quán Redis–MongoDB khi abort
describe('POST /api/orders — Property 5: Redis–MongoDB consistency on abort', () => {
  it('restores Redis flash-sale stock to its original value S when the Mongo transaction aborts', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Initial Redis flash-sale stock S, large enough that the two qty=1
        // decrements succeed before the transaction aborts.
        fc.integer({ min: 2, max: 1000 }),
        async (S) => {
          // Clean slate per iteration.
          await mongoServer.clearAll();
          redisMockState.reset();

          // A product with stock for only ONE unit, but the cart asks for it
          // twice. The early read-validation passes per item (1 >= 1) and an
          // active flash sale decrements Redis for both items; then the
          // in-transaction conditional decrement depletes stock on the first
          // item and fails on the second -> transaction aborts.
          const { user, shop, product } = await seedBasicScenario({
            product: { countInStock: 1, price: 100 },
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

          // Preheat Redis flash-sale stock to S. Allow a real rollback to
          // actually restore the decremented units.
          redisMockState.setStock(promoId, prodId, S);
          redisMockState.forceRollbackError = false;

          const body = {
            orderItems: [
              { product: prodId, name: product.name, qty: 1, image: 'x.jpg', price: 100 },
              { product: prodId, name: product.name, qty: 1, image: 'x.jpg', price: 100 },
            ],
            shippingAddress,
            paymentMethod: 'COD',
          };

          const res = await postOrder(app, token, body);

          // Transaction aborts -> 400 and no order persisted.
          expect(res.status).toBe(400);
          expect(await Order.countDocuments()).toBe(0);

          // Redis decrements must have been fully rolled back: stock back to S.
          expect(redisMockState.getStock(promoId, prodId)).toBe(S);
        }
      ),
      { numRuns: 100 }
    );
  });
});
