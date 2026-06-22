/**
 * Property-based test for Property 2 (Task 4.2): atomicity on abort.
 *
 * Verifies that when any MongoDB write in the order-creation flow fails and the
 * transaction aborts, the MongoDB state after the request is identical to the
 * state before it (no Order/CoinTransaction created, countInStock/coinsBalance/
 * pendingEscrow untouched) and the API responds with HTTP 400 + an error message.
 *
 * Reliable abort trigger: a cart with two line-items for the SAME product where
 * each item's qty passes the early per-item read-validation independently
 * (qty <= countInStock) but their cumulative sum exceeds stock. The first
 * in-transaction conditional decrement succeeds, the second finds insufficient
 * stock (countInStock < qty), throws InsufficientStockError, and aborts the
 * transaction. To also exercise the coins-deduction rollback path, the buyer
 * redeems coins, which are deducted earlier in the transaction and must be
 * fully restored by the abort.
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
import { seedBasicScenario, makeToken, createOrderApp, postOrder } from './helpers/seed';
import Order from '../models/Order';
import Product from '../models/Product';
import User from '../models/User';
import SellerWallet from '../models/SellerWallet';
import CoinTransaction from '../models/CoinTransaction';

let app: Express;

const PRICE = 100;
const INITIAL_COINS = 1000;

const shippingAddress = {
  address: '1 Test Street',
  city: 'Hồ Chí Minh',
  postalCode: '70000',
  country: 'VN',
};

/**
 * Generates a stock level plus two quantities for the same product such that:
 *  - each qty <= stock (so the per-item read-validation passes), and
 *  - qtyA + qtyB > stock (so the cumulative in-transaction decrement aborts).
 * Also generates a coin-redeem amount to exercise the coins rollback path.
 */
const abortScenarioArb = fc
  .record({
    stock: fc.integer({ min: 1, max: 20 }),
    qtyARaw: fc.integer({ min: 1, max: 20 }),
    qtyBRaw: fc.integer({ min: 1, max: 20 }),
    redeemCoins: fc.integer({ min: 0, max: 50 }),
  })
  .map(({ stock, qtyARaw, qtyBRaw, redeemCoins }) => {
    const qtyA = Math.min(qtyARaw, stock);
    let qtyB = Math.min(qtyBRaw, stock);
    // Force the cumulative sum to exceed stock so the abort is guaranteed.
    if (qtyA + qtyB <= stock) {
      qtyB = stock - qtyA + 1; // in [1, stock] since qtyA >= 1
    }
    return { stock, qtyA, qtyB, redeemCoins };
  });

beforeAll(async () => {
  await mongoServer.connect();
  app = await createOrderApp();
});

afterAll(async () => {
  await mongoServer.disconnect();
});

describe('POST /api/orders — Property 2: atomicity on abort (P2)', () => {
  // Feature: transactional-order-creation, Property 2: Tính nguyên tử khi abort
  // Validates: Requirements 1.3, 1.4
  it('leaves MongoDB state unchanged and returns 400 when the transaction aborts', async () => {
    await fc.assert(
      fc.asyncProperty(abortScenarioArb, async ({ stock, qtyA, qtyB, redeemCoins }) => {
        // Isolate each iteration: fresh DB + Redis mock state.
        await mongoServer.clearAll();
        redisMockState.reset();

        const { user, product } = await seedBasicScenario({
          user: { coinsBalance: INITIAL_COINS },
          product: { countInStock: stock, price: PRICE },
        });
        const token = makeToken(user._id);

        // Capture pre-request MongoDB state.
        const before = {
          orderCount: await Order.countDocuments(),
          coinTxCount: await CoinTransaction.countDocuments(),
          countInStock: (await Product.findById(product._id))!.countInStock,
          coinsBalance: (await User.findById(user._id))!.coinsBalance,
          pendingEscrow: (await SellerWallet.findOne({ shopId: product.shop }))!.pendingEscrow,
        };

        const body = {
          orderItems: [
            { product: product._id.toString(), name: product.name, qty: qtyA, image: 'x.jpg', price: PRICE },
            { product: product._id.toString(), name: product.name, qty: qtyB, image: 'x.jpg', price: PRICE },
          ],
          shippingAddress,
          paymentMethod: 'COD',
          redeemCoins,
        };

        const res = await postOrder(app, token, body);

        // The transaction must abort -> HTTP 400 with a descriptive error message.
        expect(res.status).toBe(400);
        expect(res.body.error).toBeTruthy();

        // MongoDB state after == before (nothing persisted, nothing mutated).
        const after = {
          orderCount: await Order.countDocuments(),
          coinTxCount: await CoinTransaction.countDocuments(),
          countInStock: (await Product.findById(product._id))!.countInStock,
          coinsBalance: (await User.findById(user._id))!.coinsBalance,
          pendingEscrow: (await SellerWallet.findOne({ shopId: product.shop }))!.pendingEscrow,
        };

        expect(after.orderCount).toBe(before.orderCount);
        expect(after.coinTxCount).toBe(before.coinTxCount);
        expect(after.countInStock).toBe(before.countInStock);
        expect(after.coinsBalance).toBe(before.coinsBalance);
        expect(after.pendingEscrow).toBe(before.pendingEscrow);
      }),
      { numRuns: 100 }
    );
  });
});
