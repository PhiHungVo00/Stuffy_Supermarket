// Feature: transactional-order-creation, Property 3: Từ chối khi thiếu kho ở bước trừ trong transaction
/**
 * Property-based test for Property 3 (Task 4.3).
 *
 * Property 3: Từ chối khi thiếu kho ở bước trừ trong transaction
 *   For any giỏ hàng trong đó ít nhất một sản phẩm có `qty` lớn hơn
 *   `countInStock` tại thời điểm trừ kho, hệ thống abort transaction và trả
 *   HTTP 400 nêu rõ sản phẩm thiếu hàng, đồng thời không tạo `Order` nào và
 *   không thay đổi `countInStock` của bất kỳ sản phẩm nào.
 *
 * Validates: Requirements 2.2
 *
 * Note: the handler runs a read-validation up front that returns 400 when
 * `countInStock < qty` for an item ("Insufficient stock for {name}. Available:
 * {n}"). Property 3 targets the abort + 400 + no Order + unchanged countInStock
 * outcome, which holds whether the request is blocked at read-validation or at
 * the in-transaction conditional decrement. Generating `qty > countInStock`
 * exercises this rejection guarantee.
 *
 * Redis is mocked BEFORE the orders router is imported (createOrderApp lazily
 * imports it) so no real Redis connection is opened.
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

describe('POST /api/orders — Property 3: reject on insufficient stock (Req 2.2)', () => {
  it('aborts with 400, creates no Order, and leaves countInStock unchanged when qty > stock', async () => {
    await fc.assert(
      fc.asyncProperty(
        // countInStock in 1..5; qty = countInStock + (1..3) so qty > stock always.
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 3 }),
        async (countInStock, over) => {
          // Fresh state each iteration.
          await mongoServer.clearAll();
          redisMockState.reset();

          const qty = countInStock + over;

          const { user, product } = await seedBasicScenario({
            product: { countInStock, price: 100 },
          });
          const token = makeToken(user._id);

          const body = {
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

          const res = await postOrder(app, token, body);

          // HTTP 400 with an error message naming the shortage / insufficiency.
          expect(res.status).toBe(400);
          expect(res.body.error).toBeTruthy();
          expect(String(res.body.error)).toMatch(/insufficient|stock|depleted/i);

          // No Order persisted for the cart of only this deficient product.
          expect(await Order.countDocuments()).toBe(0);

          // countInStock unchanged.
          const reloaded = await Product.findById(product._id);
          expect(reloaded!.countInStock).toBe(countInStock);
        }
      ),
      { numRuns: 100 }
    );
  });
});
