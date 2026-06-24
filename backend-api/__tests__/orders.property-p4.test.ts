// Feature: transactional-order-creation, Property 4: An toàn cạnh tranh — không bán âm tồn kho
/**
 * Property-based test for Property 4 (Task 4.4).
 *
 * Property 4: An toàn cạnh tranh — không bán âm tồn kho.
 * *For any* tồn kho ban đầu `N` của một sản phẩm và bất kỳ số lượng `k` request
 * đặt hàng đồng thời mỗi request mua `qty`, số đơn thành công không vượt quá
 * `floor(N / qty)`, `countInStock` cuối cùng luôn `>= 0`, và `countInStock` cuối
 * bằng `N - (số đơn thành công × qty)`.
 *
 * Validates: Requirements 2.3
 *
 * The in-transaction conditional decrement (`findOneAndUpdate({ countInStock:
 * { $gte: qty } }, { $inc: { countInStock: -qty } })`) together with the replica
 * set's write-conflict retry is what makes this test meaningful: concurrent
 * transactions racing on the same product either commit a valid decrement or
 * lose the race and get rejected — never overselling.
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
import Product from '../models/Product';

let app: Express;

const shippingAddress = {
  address: '1 Test Street',
  city: 'Hồ Chí Minh',
  postalCode: '70000',
  country: 'VN',
};

/**
 * Each iteration boots a fresh scenario and fires up to `k` (≤8) genuinely
 * concurrent order requests, each driving a MongoDB multi-document transaction
 * with write-conflict retries — by far the heaviest property in the suite.
 * Measured cost is ~0.35s/run on the in-memory replica set, so the full 100
 * runs complete well within the Jest timeout while broadly covering the
 * (N, k, qty) contention space.
 */
const NUM_RUNS = 100;

/** Build a single-item order body buying `qty` of `product`. */
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

afterAll(async () => {
  await mongoServer.disconnect();
});

describe('POST /api/orders — Property 4: concurrency safety, no negative stock (Req 2.3)', () => {
  it('never oversells under concurrent orders: successes ≤ floor(N/qty) and stock = N - successes*qty ≥ 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Initial stock N (1..10).
          n: fc.integer({ min: 1, max: 10 }),
          // Number of concurrent order requests k (2..8).
          k: fc.integer({ min: 2, max: 8 }),
          // Quantity purchased per request (1..3).
          qty: fc.integer({ min: 1, max: 3 }),
        }),
        async ({ n, k, qty }) => {
          // Fresh, isolated state per iteration.
          await mongoServer.clearAll();
          redisMockState.reset();

          // One buyer, one shop+wallet, one product with countInStock = N.
          const { user, product } = await seedBasicScenario({
            product: { countInStock: n, price: 100 },
          });
          const token = makeToken(user._id);

          // Fire k order requests concurrently, each buying `qty`.
          const responses = await Promise.all(
            Array.from({ length: k }, () => postOrder(app, token, orderBody(product, qty)))
          );

          const successCount = responses.filter((r) => r.status === 201).length;

          const updated = await Product.findById(product._id);
          const finalStock = updated!.countInStock;

          const maxSuccesses = Math.floor(n / qty);

          // No oversell: at most floor(N/qty) orders can succeed.
          expect(successCount).toBeLessThanOrEqual(maxSuccesses);
          // Stock never goes negative.
          expect(finalStock).toBeGreaterThanOrEqual(0);
          // Stock decremented exactly by the committed orders.
          expect(finalStock).toBe(n - successCount * qty);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
