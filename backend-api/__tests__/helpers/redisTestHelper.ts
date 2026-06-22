/**
 * Redis test helper.
 *
 * The order-creation flow coordinates a MongoDB transaction with Redis-backed
 * flash-sale inventory via `RedisInventoryService`. Redis cannot participate
 * in the Mongo transaction, so tests need a controllable, observable stand-in
 * for that service:
 *  - an in-memory stock store (no real Redis connection / open handle),
 *  - call logs so tests can assert decrement/rollback were invoked,
 *  - failure injection so tests can force errors (e.g. rollback failure for
 *    Requirement 3.3, or insufficient-stock `-2` for Requirement 3.4).
 *
 * Wire it into a test by mocking the real module BEFORE importing the route:
 *
 *   jest.mock('../../services/RedisInventoryService', () =>
 *     require('../helpers/redisTestHelper').redisMockModule());
 *
 *   import { redisMockState } from '../helpers/redisTestHelper';
 *
 * Then drive behavior via `redisMockState` (seed stock, inspect calls, force
 * errors) and call `redisMockState.reset()` between tests.
 */

export interface RedisCall {
  promotionId: string;
  productId: string;
  qty: number;
}

function key(promotionId: string, productId: string): string {
  return `flashsale:stock:${promotionId}:${productId}`;
}

/**
 * Mutable shared state for the mock. Exposed so tests can seed stock,
 * inspect call history, and inject failures.
 */
class RedisMockState {
  /** In-memory flash-sale stock keyed by `flashsale:stock:<promo>:<product>`. */
  store = new Map<string, number>();

  decrementCalls: RedisCall[] = [];
  rollbackCalls: RedisCall[] = [];
  preheatCalls: RedisCall[] = [];

  /** When set, decrementInventory returns this code instead of computing. */
  forceDecrementResult: number | null = null;
  /** When true, rollbackInventory throws (simulates Redis failure, Req 3.3). */
  forceRollbackError = false;
  /** Controls isRedisReady(); defaults to ready in tests. */
  ready = true;

  /** Pre-load stock for a promotion/product. */
  setStock(promotionId: string, productId: string, stock: number): void {
    this.store.set(key(promotionId, productId), stock);
  }

  /** Read current stock, or null if not preheated. */
  getStock(promotionId: string, productId: string): number | null {
    const k = key(promotionId, productId);
    return this.store.has(k) ? (this.store.get(k) as number) : null;
  }

  /** Restore all state to defaults. Call between tests. */
  reset(): void {
    this.store.clear();
    this.decrementCalls = [];
    this.rollbackCalls = [];
    this.preheatCalls = [];
    this.forceDecrementResult = null;
    this.forceRollbackError = false;
    this.ready = true;
  }
}

export const redisMockState = new RedisMockState();

/**
 * Mock implementation mirroring the real `RedisInventoryService` contract:
 * decrement returns remaining stock (>=0), -1 not preheated, -2 insufficient,
 * -3 disconnected fallback.
 */
export class RedisInventoryService {
  static isRedisReady(): boolean {
    return redisMockState.ready;
  }

  static async preheatInventory(promotionId: string, productId: string, stock: number): Promise<void> {
    redisMockState.preheatCalls.push({ promotionId, productId, qty: stock });
    redisMockState.store.set(key(promotionId, productId), stock);
  }

  static async decrementInventory(promotionId: string, productId: string, quantity: number): Promise<number> {
    redisMockState.decrementCalls.push({ promotionId, productId, qty: quantity });

    if (redisMockState.forceDecrementResult !== null) {
      return redisMockState.forceDecrementResult;
    }
    if (!redisMockState.ready) {
      return -3;
    }

    const k = key(promotionId, productId);
    if (!redisMockState.store.has(k)) {
      return -1; // not preheated
    }
    const current = redisMockState.store.get(k) as number;
    if (current < quantity) {
      return -2; // insufficient
    }
    const remaining = current - quantity;
    redisMockState.store.set(k, remaining);
    return remaining;
  }

  static async rollbackInventory(promotionId: string, productId: string, quantity: number): Promise<void> {
    redisMockState.rollbackCalls.push({ promotionId, productId, qty: quantity });

    if (redisMockState.forceRollbackError) {
      throw new Error('Forced Redis rollback failure (test)');
    }
    const k = key(promotionId, productId);
    if (redisMockState.store.has(k)) {
      redisMockState.store.set(k, (redisMockState.store.get(k) as number) + quantity);
    }
  }

  static async getInventory(promotionId: string, productId: string): Promise<number | null> {
    return redisMockState.getStock(promotionId, productId);
  }
}

/**
 * Factory returning the module shape expected by `jest.mock(...)` for
 * `../../services/RedisInventoryService` (named export `RedisInventoryService`).
 */
export function redisMockModule() {
  return { RedisInventoryService };
}
