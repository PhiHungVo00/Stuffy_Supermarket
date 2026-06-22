/**
 * Edge-case test for a missing-replica-set environment (Task 6.1, Req 5.2).
 *
 * MongoDB multi-document transactions require a replica set. On a single-node
 * deployment, `session.withTransaction(...)` fails with an IllegalOperation
 * error ("Transaction numbers are only allowed on a replica set member or
 * mongos"). The handler must detect this signal and respond with an explicit
 * configuration error (HTTP 500) WITHOUT leaving any half-written MongoDB state.
 *
 * The real test DB is an in-memory replica set (transactions actually work),
 * so we simulate the single-node failure by spying on `mongoose.startSession`
 * to return a fake session whose `withTransaction` throws the replica-set
 * error. The spy is restored after the test so no other suite is affected.
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
import { seedBasicScenario, makeToken, createOrderApp, postOrder } from './helpers/seed';
import Order from '../models/Order';
import Product from '../models/Product';

let app: Express;

const shippingAddress = {
  address: '1 Test Street',
  city: 'Hồ Chí Minh',
  postalCode: '70000',
  country: 'VN',
};

/** Build a single-item order body for `product`. */
function orderBody(product: any, qty: number) {
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
  };
}

beforeAll(async () => {
  await mongoServer.connect();
  app = await createOrderApp();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await mongoServer.clearAll();
  redisMockState.reset();
});

afterAll(async () => {
  await mongoServer.disconnect();
});

describe('POST /api/orders — missing replica set environment (Req 5.2)', () => {
  it('returns an explicit replica-set configuration error (500) and writes nothing to MongoDB', async () => {
    const { user, product } = await seedBasicScenario({
      // Sufficient stock so the request clears read-validation and reaches the
      // transaction-open step where the simulated failure occurs.
      product: { countInStock: 10, price: 100 },
    });
    const token = makeToken(user._id);

    // Simulate a single-node MongoDB: startSession yields a session whose
    // withTransaction throws the IllegalOperation replica-set error.
    const replicaSetError: any = new Error(
      'Transaction numbers are only allowed on a replica set member or mongos'
    );
    replicaSetError.codeName = 'IllegalOperation';

    const fakeSession: any = {
      withTransaction: jest.fn(async () => {
        throw replicaSetError;
      }),
      endSession: jest.fn(async () => {}),
    };
    const startSessionSpy = jest
      .spyOn(mongoose, 'startSession')
      .mockResolvedValue(fakeSession);

    const res = await postOrder(app, token, orderBody(product, 2));

    // The spy fired and the fake transaction was attempted.
    expect(startSessionSpy).toHaveBeenCalled();
    expect(fakeSession.withTransaction).toHaveBeenCalled();
    // Session is always closed in the finally block.
    expect(fakeSession.endSession).toHaveBeenCalled();

    // Explicit configuration error surfaced to the client.
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
    expect(res.body.error).toContain('replica set');

    // No half-written MongoDB state: no order persisted, stock untouched.
    expect(await Order.countDocuments()).toBe(0);
    const updated = await Product.findById(product._id);
    expect(updated!.countInStock).toBe(10);
  });
});
