/**
 * Integration test for Redis flash-sale inventory decrement (Task 6.2).
 *
 * Verifies Requirement 3.1: when a product with an ACTIVE flash sale is
 * purchased, the order-creation flow decrements the flash-sale inventory on
 * Redis via `RedisInventoryService.decrementInventory`, and the Redis stock
 * is reduced by exactly the ordered qty. The order itself must be created
 * successfully (HTTP 201) on the happy path.
 *
 * Redis must be mocked BEFORE the orders router is imported (createOrderApp
 * lazily imports it), so the jest.mock call sits at the top of the file.
 */
jest.mock('../services/RedisInventoryService', () =>
  require('./helpers/redisTestHelper').redisMockModule()
);

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

describe('POST /api/orders — Redis flash-sale decrement integration (Req 3.1)', () => {
  it('decrements Redis flash-sale stock by the ordered qty and creates the order (201)', async () => {
    // Product stock large enough that the in-transaction conditional decrement
    // succeeds; Redis flash-sale stock S large enough to cover the order qty.
    const S = 100;
    const qty = 3;

    const { user, shop, product } = await seedBasicScenario({
      product: { countInStock: 1000, price: 100 },
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

    // Preheat Redis flash-sale stock to S.
    redisMockState.setStock(promoId, prodId, S);

    const body = {
      orderItems: [
        { product: prodId, name: product.name, qty, image: 'x.jpg', price: 100 },
      ],
      shippingAddress,
      paymentMethod: 'COD',
    };

    const res = await postOrder(app, token, body);

    // Happy path: the order is created.
    expect(res.status).toBe(201);
    expect(res.body._id).toBeTruthy();
    expect(await Order.countDocuments()).toBe(1);

    // RedisInventoryService.decrementInventory was called with the right
    // promotion/product/qty.
    const decrement = redisMockState.decrementCalls.find(
      (c) => c.promotionId === promoId && c.productId === prodId && c.qty === qty
    );
    expect(decrement).toBeDefined();

    // Redis flash-sale stock dropped by exactly the ordered qty.
    expect(redisMockState.getStock(promoId, prodId)).toBe(S - qty);

    // No rollback should have happened on the happy path.
    expect(redisMockState.rollbackCalls.length).toBe(0);

    // MongoDB product stock decremented by qty as well.
    const updated = await Product.findById(product._id);
    expect(updated!.countInStock).toBe(1000 - qty);
  });
});
