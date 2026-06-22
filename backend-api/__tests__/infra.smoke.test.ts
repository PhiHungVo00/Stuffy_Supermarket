/**
 * Infrastructure smoke test for Task 1.
 *
 * Verifies the test harness itself works end-to-end:
 *  - Jest + ts-jest run TypeScript tests.
 *  - mongodb-memory-server boots a replica set that supports MongoDB
 *    multi-document transactions (the core requirement for this feature).
 *  - fast-check is installed and runs property checks.
 *  - The seed helpers create the expected documents.
 *  - The Redis mock helper tracks calls and supports failure injection.
 *
 * This does NOT exercise the order handler (covered by later tasks).
 */
import mongoose from 'mongoose';
import fc from 'fast-check';
import * as mongoServer from './helpers/mongoTestServer';
import { redisMockState, RedisInventoryService } from './helpers/redisTestHelper';
import { seedBasicScenario, makeToken } from './helpers/seed';
import Order from '../models/Order';
import User from '../models/User';

beforeAll(async () => {
  await mongoServer.connect();
});

afterEach(async () => {
  await mongoServer.clearAll();
  redisMockState.reset();
});

afterAll(async () => {
  await mongoServer.disconnect();
});

describe('mongo replica set', () => {
  it('exposes a replicaSet connection URI', () => {
    const uri = mongoServer.getUri();
    expect(uri).toBeTruthy();
    expect(uri).toContain('replicaSet=');
  });

  it('commits a multi-document transaction', async () => {
    const buyer = await User.create({
      name: 'Tx Buyer',
      email: `tx_${Date.now()}@test.local`,
      password: 'pw',
    });
    const shopId = new mongoose.Types.ObjectId();

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Order.create(
          [
            {
              user: buyer._id,
              shop: shopId,
              orderItems: [
                { name: 'Item', qty: 1, image: 'x.jpg', price: 10, product: new mongoose.Types.ObjectId() },
              ],
              shippingAddress: { address: 'a', city: 'c', postalCode: '00000', country: 'VN' },
              itemsPrice: 10,
              totalPrice: 10,
            },
          ],
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    expect(await Order.countDocuments()).toBe(1);
  });

  it('aborts a transaction leaving no partial writes', async () => {
    const buyer = await User.create({
      name: 'Abort Buyer',
      email: `abort_${Date.now()}@test.local`,
      password: 'pw',
    });

    const session = await mongoose.startSession();
    await expect(
      session.withTransaction(async () => {
        await Order.create(
          [
            {
              user: buyer._id,
              shop: new mongoose.Types.ObjectId(),
              orderItems: [
                { name: 'Item', qty: 1, image: 'x.jpg', price: 10, product: new mongoose.Types.ObjectId() },
              ],
              shippingAddress: { address: 'a', city: 'c', postalCode: '00000', country: 'VN' },
              itemsPrice: 10,
              totalPrice: 10,
            },
          ],
          { session }
        );
        throw new Error('force abort');
      })
    ).rejects.toThrow('force abort');
    await session.endSession();

    expect(await Order.countDocuments()).toBe(0);
  });
});

describe('fast-check', () => {
  it('runs a property check', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
      { numRuns: 100 }
    );
  });
});

describe('seed helpers', () => {
  it('seeds a basic scenario', async () => {
    const { user, shop, product, wallet } = await seedBasicScenario({
      product: { countInStock: 7, price: 25 },
    });

    expect(await User.countDocuments()).toBeGreaterThanOrEqual(1);
    expect(product.countInStock).toBe(7);
    expect(product.shop.toString()).toBe(shop._id.toString());
    expect(wallet.shopId.toString()).toBe(shop._id.toString());
    expect(wallet.pendingEscrow).toBe(0);

    const token = makeToken(user._id);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
  });
});

describe('redis mock helper', () => {
  it('tracks decrement and rollback and supports failure injection', async () => {
    redisMockState.setStock('promo1', 'prod1', 5);

    const afterDecrement = await RedisInventoryService.decrementInventory('promo1', 'prod1', 3);
    expect(afterDecrement).toBe(2);
    expect(redisMockState.decrementCalls).toHaveLength(1);

    const insufficient = await RedisInventoryService.decrementInventory('promo1', 'prod1', 99);
    expect(insufficient).toBe(-2);

    await RedisInventoryService.rollbackInventory('promo1', 'prod1', 3);
    expect(redisMockState.getStock('promo1', 'prod1')).toBe(5);
    expect(redisMockState.rollbackCalls).toHaveLength(1);

    redisMockState.forceRollbackError = true;
    await expect(RedisInventoryService.rollbackInventory('promo1', 'prod1', 1)).rejects.toThrow(
      /Forced Redis rollback failure/
    );
  });
});
