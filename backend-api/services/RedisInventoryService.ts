import redis from '../redis';

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
    if (!this.isRedisReady()) {
      console.warn('[RedisInventory] Redis is not connected. Skipping inventory preheat.');
      return;
    }
    try {
      const key = `flashsale:stock:${promotionId}:${productId}`;
      // Set stock with a TTL of 24 hours (86400 seconds)
      await redis.set(key, stock, 'EX', 86400);
      console.log(`[RedisInventory] Preheated stock for promotion ${promotionId}, product ${productId}: ${stock}`);
    } catch (err: any) {
      console.error('[RedisInventory] Error preheating inventory:', err.message);
    }
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
    if (!this.isRedisReady()) {
      console.warn('[RedisInventory] Redis is not connected. Falling back to DB stock check.');
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
      return Number(result);
    } catch (err: any) {
      console.error('[RedisInventory] Error decrementing inventory, falling back to DB:', err.message);
      return -3;
    }
  }

  /**
   * Restores stock in Redis on checkout failures/rollback.
   */
  static async rollbackInventory(promotionId: string, productId: string, quantity: number): Promise<void> {
    if (!this.isRedisReady()) {
      return;
    }
    try {
      const key = `flashsale:stock:${promotionId}:${productId}`;
      const exists = await redis.exists(key);
      if (exists) {
        await redis.incrby(key, quantity);
        console.log(`[RedisInventory] Rolled back stock for promotion ${promotionId}, product ${productId}: +${quantity}`);
      }
    } catch (err: any) {
      console.error('[RedisInventory] Error rolling back inventory:', err.message);
    }
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

