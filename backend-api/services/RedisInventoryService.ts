/// <reference path="../declarations.d.ts" />
import redis from '../redis';
import { trace, SpanStatusCode } from '@opentelemetry/api';

export class RedisInventoryService {
  /**
   * Helper to check if Redis connection is active and ready.
   */
  static isRedisReady(): boolean {
    return redis.status === 'ready';
  }

  /**
   * Preheats the inventory of a product for a specific promotion/flash sale.
   */
  static async preheatInventory(promotionId: string, productId: string, stock: number): Promise<void> {
    const tracer = trace.getTracer('backend-api-redis-inventory');
    return tracer.startActiveSpan('redis_inventory.preheat', async (span: any) => {
      span.setAttribute('redis.promotion_id', promotionId);
      span.setAttribute('redis.product_id', productId);
      span.setAttribute('redis.stock', stock);
      span.setAttribute('redis.ready', this.isRedisReady());

      if (!this.isRedisReady()) {
        console.warn('[RedisInventory] Redis is not connected. Skipping inventory preheat.');
        span.end();
        return;
      }
      try {
        const key = `flashsale:stock:${promotionId}:${productId}`;
        await redis.set(key, stock, 'EX', 86400);
        console.log(`[RedisInventory] Preheated stock for promotion ${promotionId}, product ${productId}: ${stock}`);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err: any) {
        console.error('[RedisInventory] Error preheating inventory:', err.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        span.recordException(err);
      } finally {
        span.end();
      }
    });
  }

  /**
   * Decrements stock atomically using a Lua script.
   * Returns:
   *  >= 0: remaining stock (success)
   *  -1: not preheated / campaign inactive
   *  -2: insufficient stock
   *  -3: Redis disconnected fallback
   */
  static async decrementInventory(promotionId: string, productId: string, quantity: number): Promise<number> {
    const tracer = trace.getTracer('backend-api-redis-inventory');
    return tracer.startActiveSpan('redis_inventory.decrement', async (span: any) => {
      span.setAttribute('redis.promotion_id', promotionId);
      span.setAttribute('redis.product_id', productId);
      span.setAttribute('redis.qty', quantity);
      span.setAttribute('redis.ready', this.isRedisReady());

      if (!this.isRedisReady()) {
        console.warn('[RedisInventory] Redis is not connected. Falling back to DB stock check.');
        span.end();
        return -3;
      }
      try {
        const key = `flashsale:stock:${promotionId}:${productId}`;
        const luaScript = `
          local key = KEYS[1]
          local quantity = tonumber(ARGV[1])
          local current = redis.call('get', key)
          if not current then
            return -1
          end
          current = tonumber(current)
          if current < quantity then
            return -2
          end
          local remaining = current - quantity
          redis.call('set', key, remaining)
          return remaining
        `;
        const result = await redis.eval(luaScript, 1, key, quantity);
        const code = Number(result);
        span.setAttribute('redis.result_code', code);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return code;
      } catch (err: any) {
        console.error('[RedisInventory] Error decrementing inventory, falling back to DB:', err.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        span.recordException(err);
        span.end();
        return -3;
      }
    });
  }

  /**
   * Restores stock in Redis on checkout failures/rollback.
   */
  static async rollbackInventory(promotionId: string, productId: string, quantity: number): Promise<void> {
    const tracer = trace.getTracer('backend-api-redis-inventory');
    return tracer.startActiveSpan('redis_inventory.rollback', async (span: any) => {
      span.setAttribute('redis.promotion_id', promotionId);
      span.setAttribute('redis.product_id', productId);
      span.setAttribute('redis.qty', quantity);
      span.setAttribute('redis.ready', this.isRedisReady());

      if (!this.isRedisReady()) {
        span.end();
        return;
      }
      try {
        const key = `flashsale:stock:${promotionId}:${productId}`;
        const exists = await redis.exists(key);
        if (exists) {
          await redis.incrby(key, quantity);
          console.log(`[RedisInventory] Rolled back stock for promotion ${promotionId}, product ${productId}: +${quantity}`);
        }
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err: any) {
        console.error('[RedisInventory] Error rolling back inventory:', err.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        span.recordException(err);
      } finally {
        span.end();
      }
    });
  }

  /**
   * Helper to manually query current Redis stock
   */
  static async getInventory(promotionId: string, productId: string): Promise<number | null> {
    if (!this.isRedisReady()) {
      return null;
    }
    try {
      const key = `flashsale:stock:${promotionId}:${productId}`;
      const stock = await redis.get(key);
      return stock !== null ? Number(stock) : null;
    } catch (err: any) {
      console.error('[RedisInventory] Error getting inventory:', err.message);
      return null;
    }
  }
}

