import "./tracing";
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloGateway, IntrospectAndCompose } from '@apollo/gateway';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';
import { 
  getComplexity, 
  simpleEstimator, 
  fieldExtensionsEstimator 
} from 'graphql-query-complexity';

// Setup Redis for Rate Limiting (Ultra-Resilient Config)
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Don't crash if redis is missing
  retryStrategy: (times) => Math.min(times * 100, 3000),
  showFriendlyErrorStack: true,
  enableOfflineQueue: false, // Fail immediately when offline to prevent hanging requests
});

redis.on('error', (err) => console.error('[Gateway] ❌ Redis Connection Error:', err.message));

// Detect Production for Subgraphs
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const BACKEND_URL = process.env.PRODUCTS_SERVICE_URL || (isProduction 
  ? 'https://stuffy-backend-api.onrender.com/graphql' 
  : 'http://localhost:5000/graphql');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true, // Fail-open: bypass rate limiting if Redis is down
  store: new RedisStore({
    // @ts-ignore
    sendCommand: async (...args: string[]) => {
      const command = args[0] ? args[0].toLowerCase() : '';
      const subcommand = args[1] ? args[1].toLowerCase() : '';
      
      if (command === 'script' && subcommand === 'load') {
        if (redis.status !== 'ready') {
          return '0123456789abcdef0123456789abcdef01234567';
        }
      }
      
      if (redis.status !== 'ready') {
        throw new Error('Redis not ready');
      }
      return redis.call(args[0], ...args.slice(1));
    },
  }),
});

const authCheckoutLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // 5 requests
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication or checkout requests, please try again after a minute.' } as any,
  passOnStoreError: true, // Fail-open: bypass rate limiting if Redis is down
  store: new RedisStore({
    // @ts-ignore
    sendCommand: async (...args: string[]) => {
      const command = args[0] ? args[0].toLowerCase() : '';
      const subcommand = args[1] ? args[1].toLowerCase() : '';
      
      if (command === 'script' && subcommand === 'load') {
        if (redis.status !== 'ready') {
          return '0123456789abcdef0123456789abcdef01234567';
        }
      }
      
      if (redis.status !== 'ready') {
        throw new Error('Redis not ready');
      }
      return redis.call(args[0], ...args.slice(1));
    },
  }),
  keyGenerator: (req) => `${req.ip}:auth_checkout`,
});

const app = express();
const httpServer = http.createServer(app);

// Configure the Gateway to pull from our subgraphs
const gateway = new ApolloGateway({
  supergraphSdl: new IntrospectAndCompose({
    subgraphs: [
      { name: 'products', url: BACKEND_URL },
    ],
  }),
});

const server = new ApolloServer({
  gateway,
  plugins: [
    {
      async requestDidStart() {
        return {
          async didResolveOperation({ request, document, schema }) {
            const complexity = getComplexity({
              schema,
              operationName: request.operationName,
              query: document,
              variables: request.variables,
              estimators: [
                fieldExtensionsEstimator(),
                simpleEstimator({ defaultComplexity: 1 }),
              ],
            });

            const MAX_COMPLEXITY = 50;
            if (complexity > MAX_COMPLEXITY) {
              throw new Error(
                `Query is too complex: ${complexity}. Maximum complexity allowed is ${MAX_COMPLEXITY}.`
              );
            }
            console.log(`[Security] Query complexity: ${complexity}`);
          },
        };
      },
    },
  ],
});

async function startServer() {
  console.log(`[GraphQL Gateway] Waiting for subgraphs to be ready... Target: ${BACKEND_URL}`);
  let ready = false;
  let attempts = 0;
  while (!ready && attempts < 30) {
    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __schema { queryType { name } } }' })
      });
      if (response.status === 200 || response.status === 400) {
        ready = true;
        console.log(`[GraphQL Gateway] Subgraph is ready!`);
      } else {
        console.log(`[GraphQL Gateway] Subgraph returned status ${response.status}. Retrying in 1s...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (err: any) {
      console.log(`[GraphQL Gateway] Subgraph not ready yet: ${err.message}. Retrying in 1s...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    attempts++;
  }

  await server.start();
  app.use(cors<cors.CorsRequest>(), express.json());
  app.use(limiter);

  // Apply stricter rate limiting dynamically on auth or checkout mutations
  app.use('/graphql', (req, res, next) => {
    const query = req.body?.query || "";
    if (
      query.includes('login') || 
      query.includes('register') || 
      query.includes('createOrder') || 
      query.includes('placeOrder') ||
      query.includes('checkout')
    ) {
      return authCheckoutLimiter(req, res, next);
    }
    next();
  });

  app.use('/graphql', expressMiddleware(server) as any);
  
  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`[GraphQL Gateway] Running at http://localhost:${PORT}/graphql`);
  });
};

startServer().catch(err => {
  console.error('[GraphQL Gateway] Error during startup:', err);
});

// Trigger reload: 639162566501023119