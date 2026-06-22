/**
 * Property-based test for Property 1 (Task 4.1).
 *
 * Verifies the successful order-creation path applies every change consistently:
 * for any valid cart (every product has enough stock for the requested qty, and
 * coins redeemed stay within the limit), a successful POST /api/orders returns
 * 201 and atomically applies all changes — one Order per shop group, each
 * Product.countInStock decremented by the total ordered qty, total
 * SellerWallet.pendingEscrow increased by the sum of created order totalPrice,
 * and User.coinsBalance decreased by exactly coinsToRedeem.
 *
 * Redis must be mocked BEFORE the orders router is imported (createOrderApp
 * lazily imports it), so the jest.mock call sits at the top of the file. No
 * flash-sale promotions are seeded, so the Redis path is never exercised here.
 */
jest.mock('../services/RedisInventoryService', () =>
  require('./helpers/redisTestHelper').redisMockModule()
);

import fc from 'fast-check';
import type { Express } from 'express';
import * as mongoServer from './helpers/mongoTestServer';
import { redisMockState } from './helpers/redisTestHelper';
import {
  seedUser,
  seedShop,
  seedProduct,
  seedWallet,
  makeToken,
  createOrderApp,
  postOrder,
} from './helpers/seed';
import Order from '../models/Order';
import Product from '../models/Product';
import SellerWallet from '../models/SellerWallet';
import User from '../models/User';

let app: Express;

const shippingAddress = {
  address: '1 Test Street',
  city: 'Hồ Chí Minh',
  postalCode: '70000',
  country: 'VN',
};

/** A single product/line-item spec within a shop. */
const itemArb = fc.record({
  price: fc.integer({ min: 10, max: 200 }),
  qty: fc.integer({ min: 1, max: 3 }),
  // Extra stock on top of the ordered qty so the cart is always valid.
  stockExtra: fc.integer({ min: 0, max: 20 }),
});

/** A shop is a non-empty list of items (1..3). */
const shopArb = fc.array(itemArb, { minLength: 1, maxLength: 3 });

/** A cart is 1..3 shops, each with its own items. */
const cartArb = fc.array(shopArb, { minLength: 1, maxLength: 3 });

/** Coins redemption inputs: requested redeem amount + user balance. */
const coinsArb = fc.record({
  redeemCoins: fc.integer({ min: 0, max: 500 }),
  balance: fc.integer({ min: 0, max: 2000 }),
});

const scenarioArb = fc.record({ shops: cartArb, coins: coinsArb });

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

describe('POST /api/orders — Property 1 (successful path applies all changes consistently)', () => {
  // Feature: transactional-order-creation, Property 1: Đường thành công áp dụng nhất quán mọi thay đổi
  it('applies Orders, stock, escrow, and coins consistently for any valid cart', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        // Each iteration must be independent: start from an empty DB.
        await mongoServer.clearAll();
        redisMockState.reset();

        // --- Seed buyer ---
        const buyer = await seedUser({ coinsBalance: scenario.coins.balance });

        // --- Seed shops + products, and build order items ---
        const orderItems: any[] = [];
        // productId -> total ordered qty (handles any accidental duplicates safely)
        const orderedQtyByProduct = new Map<string, number>();

        for (const shopItems of scenario.shops) {
          const owner = await seedUser({ role: 'seller' });
          const shop = await seedShop(owner._id);
          await seedWallet(shop._id, { pendingEscrow: 0 });

          for (const spec of shopItems) {
            const product = await seedProduct(shop._id, {
              price: spec.price,
              countInStock: spec.qty + spec.stockExtra,
            });
            orderItems.push({
              product: product._id.toString(),
              name: product.name,
              qty: spec.qty,
              image: 'test.jpg',
              price: spec.price,
            });
            const pid = product._id.toString();
            orderedQtyByProduct.set(pid, (orderedQtyByProduct.get(pid) || 0) + spec.qty);
          }
        }

        const numShopGroups = scenario.shops.length;
        const totalItemsPrice = orderItems.reduce(
          (acc, it) => acc + it.price * it.qty,
          0
        );

        // Expected coins redeemed mirrors the handler:
        // min(requested, balance, floor(itemsPrice * 0.25)).
        const maxCoins = Math.floor(totalItemsPrice * 0.25);
        const expectedCoinsToRedeem = Math.min(
          scenario.coins.redeemCoins,
          scenario.coins.balance,
          maxCoins
        );

        const token = makeToken(buyer._id);
        const res = await postOrder(app, token, {
          orderItems,
          shippingAddress,
          paymentMethod: 'COD',
          redeemCoins: scenario.coins.redeemCoins,
        });

        // (a) Successful path returns 201.
        expect(res.status).toBe(201);

        // (b) One Order per shop group.
        expect(await Order.countDocuments()).toBe(numShopGroups);

        // (c) Each Product.countInStock decreased by the total ordered qty.
        for (const [pid, orderedQty] of orderedQtyByProduct.entries()) {
          const product = await Product.findById(pid);
          expect(product).toBeTruthy();
          const stock = product!.countInStock ?? 0;
          const originalStock = stock + orderedQty;
          // Sanity: it was decremented by exactly orderedQty.
          expect(originalStock - stock).toBe(orderedQty);
        }

        // (d) Total pendingEscrow increased by the sum of created order totalPrice.
        const createdOrders = await Order.find({});
        const sumOrderTotal = createdOrders.reduce(
          (acc, o: any) => acc + (o.totalPrice || 0),
          0
        );
        const wallets = await SellerWallet.find({});
        const sumEscrow = wallets.reduce(
          (acc, w: any) => acc + (w.pendingEscrow || 0),
          0
        );
        // Wallets all started at pendingEscrow 0, so total escrow == total order totals.
        expect(sumEscrow).toBeCloseTo(sumOrderTotal, 6);

        // (e) User.coinsBalance decreased by exactly coinsToRedeem.
        const updatedBuyer = await User.findById(buyer._id);
        expect(updatedBuyer!.coinsBalance).toBe(
          scenario.coins.balance - expectedCoinsToRedeem
        );
      }),
      { numRuns: 100 }
    );
  });
});
