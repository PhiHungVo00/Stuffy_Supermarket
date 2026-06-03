import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = Number(process.env.REDIS_PORT) || 6379;

const redisOptions: any = {
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
};

const redis = REDIS_URL
  ? new Redis(REDIS_URL, redisOptions)
  : new Redis({ host: redisHost, port: redisPort, ...redisOptions });

redis.on('connect', () => console.log(`[Redis] Connection established${REDIS_URL ? ' via REDIS_URL' : ` to ${redisHost}:${redisPort}`}.`));
redis.on('error', (err) => console.error('[Redis] Connection Error:', err.message));

export const cacheData = async (key: string, data: any, ttl: number = 3600) => {
  try {
    await redis.set(key, JSON.stringify(data), 'EX', ttl);
  } catch (err) {
    console.error(`[Redis] Error caching data for key ${key}:`, err);
  }
};

export const getCachedData = async <T>(key: string): Promise<T | null> => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error(`[Redis] Error getting cached data for key ${key}:`, err);
    return null;
  }
};

export const clearCache = async (pattern: string) => {
  try {
    let cursor = '0';
    let totalDeleted = 0;
    do {
      const [nextCursor, keys] = await redis.scan(Number(cursor), 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== '0');
    if (totalDeleted > 0) {
      console.log(`[Redis] Cleared ${totalDeleted} keys matching pattern: ${pattern}`);
    }
  } catch (err) {
    console.error(`[Redis] Error clearing cache for pattern ${pattern}:`, err);
  }
};

export default redis;
