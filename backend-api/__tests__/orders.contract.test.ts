/**
 * Unit/example contract tests for POST /api/orders (Task 2.7).
 *
 * These verify the external API contract is preserved after the transactional
 * refactor (Requirement 4.3) and that a Redis rollback failure during abort is
 * only logged without breaking the response (Requirement 3.3).
 *
 * Redis must be mocked BEFORE the orders router is imported (createOrderApp
 * lazily imports it), so the jest.mock call sits at the top of the file.
 */
jest.mock('../services/RedisInventoryService', () =>
  require('./helpers/redisTestHelper').redisMockModule()
);

import mongoose from 'mongoose';
import type { Express } from 'express';
import * as mongoServer from './helpers/mongoTestServer';
import { redisMockState } from './helpers/redisTestHelper';
import {
  seedBasicScenario,
  seedProduct,
  makeToken,
  createOrderApp,
  postOrder,
} from './helpers/seed';
import Order from '../models/Order';
import Product from '../models/Product';
import Promotion from '../models/Promotion';
import Voucher from '../models/Voucher';

let app: Express;

const shippingAddress = {
  address: '1 Test Street',
  city: 'Hồ Chí Minh',
  postalCode: '70000',
  country: 'VN',
};

/** Build a single-item order body for `product`. */
function orderBody(product: any, qty: number, extra: Record<string, any> = {}) {
  return {
    orderItems: [
      {
        product: product._id.toString(),
        name: product.name,
        qty,
        image: product.image || 'test.jpg',
        price: product.price,
      },
    ],
    shippingAddress,
    paymentMethod: 'COD',
    ...extra,
  };
}

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

describe('POST /api/orders — API contract equivalence (Req 4.3)', () => {
  it('creates an order: 201 + first order document (status "Pending") and decrements stock by qty', async () => {
    const { user, product } = await seedBasicScenario({
      product: { countInStock: 10, price: 100 },
    });
    const token = makeToken(user._id);

    const res = await postOrder(app, token, orderBody(product, 2));

    expect(res.status).toBe(201);
    // Body is the first created order document.
    expect(res.body).toBeTruthy();
    expect(res.body._id).toBeTruthy();
    expect(res.body.status).toBe('Pending');
    expect(res.body.user.toString()).toBe(user._id.toString());

    // Exactly one order persisted and stock decremented by the ordered qty.
    expect(await Order.countDocuments()).toBe(1);
    const updated = await Product.findById(product._id);
    expect(updated!.countInStock).toBe(8);
  });

  it('rejects an empty cart with 400 "No order items"', async () => {
    const { user } = await seedBasicScenario();
    const token = makeToken(user._id);

    const res = await postOrder(app, token, {
      orderItems: [],
      shippingAddress,
      paymentMethod: 'COD',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No order items');
    expect(await Order.countDocuments()).toBe(0);
  });

  it('rejects a non-existent product with 400 "Product {id} not found"', async () => {
    const { user } = await seedBasicScenario();
    const token = makeToken(user._id);
    const missingId = new mongoose.Types.ObjectId();

    const res = await postOrder(app, token, {
      orderItems: [
        { product: missingId.toString(), name: 'Ghost', qty: 1, image: 'x.jpg', price: 10 },
      ],
      shippingAddress,
      paymentMethod: 'COD',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(`Product ${missingId.toString()} not found`);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('rejects a livestream-only voucher used outside livestream with 400 (unchanged message)', async () => {
    const { user, product } = await seedBasicScenario({
      product: { countInStock: 10, price: 100 },
    });
    const token = makeToken(user._id);

    await Voucher.create({
      code: 'LIVEONLY',
      type: 'discount',
      discountType: 'fixed',
      discountValue: 10,
      description: 'Livestream exclusive voucher',
      expiresAt: new Date(Date.now() + 86_400_000),
      isActive: true,
      scope: 'platform',
      isLivestreamExclusive: true,
    });

    // Applied but NOT from livestream (fromLivestream omitted/false).
    const res = await postOrder(app, token, orderBody(product, 1, { voucherCode: 'LIVEONLY' }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Voucher LIVEONLY is only valid for purchases from livestream');
    expect(await Order.countDocuments()).toBe(0);
  });
});

describe('POST /api/orders — Redis rollback failure during abort (Req 3.3)', () => {
  it('still returns 400 (no crash) when rollbackInventory throws after a transaction abort', async () => {
    // A product with stock for only ONE unit, but the cart asks for it twice.
    // The early read-validation passes for each item independently (1 >= 1),
    // an active flash sale causes Redis to be decremented for both items, then
    // the in-transaction conditional decrement depletes stock on the first item
    // and fails on the second -> transaction aborts. The catch block then runs
    // Redis rollback, which is forced to throw.
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

    // Preheat Redis flash-sale stock so decrements succeed and get recorded.
    redisMockState.setStock(flashSale._id.toString(), product._id.toString(), 5);
    // Force the rollback to throw (Req 3.3: must be logged, not break response).
    redisMockState.forceRollbackError = true;

    const body = {
      orderItems: [
        { product: product._id.toString(), name: product.name, qty: 1, image: 'x.jpg', price: 100 },
        { product: product._id.toString(), name: product.name, qty: 1, image: 'x.jpg', price: 100 },
      ],
      shippingAddress,
      paymentMethod: 'COD',
    };

    const res = await postOrder(app, token, body);

    // Handler must not crash: a 400 is returned with an error message.
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();

    // Rollback was attempted (and threw) for the Redis decrements.
    expect(redisMockState.rollbackCalls.length).toBeGreaterThan(0);

    // Transaction aborted: no order persisted, stock unchanged.
    expect(await Order.countDocuments()).toBe(0);
    const updated = await Product.findById(product._id);
    expect(updated!.countInStock).toBe(1);
  });
});
