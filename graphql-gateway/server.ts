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
  enableOfflineQueue: true, // Allow commands to be queued while reconnecting
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
  store: new RedisStore({
    // @ts-ignore
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
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

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:3006',
  'https://stuffy-container.onrender.com',
  'https://stuffy-store-app.onrender.com',
  'https://stuffy-header-app.onrender.com',
  'https://stuffy-product-app.onrender.com',
  'https://stuffy-cart-app.onrender.com',
  'https://stuffy-admin-app.onrender.com',
  'https://stuffy-profile-app.onrender.com',
  'https://stuffy-marketing-app.onrender.com',
  'https://stuffy-support-app.onrender.com',
  'https://stuffy-3d-viewer-app.onrender.com',
  'https://stuffy-design-system-app.onrender.com',
];

async function startServer() {
  await server.start();
  app.use(
    cors<cors.CorsRequest>({
      origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
    }),
    express.json(),
    limiter
  );
  app.use('/graphql', expressMiddleware(server) as any);
  
  const PORT = process.env.PORT || 4000;
    httpServer.listen(PORT, () => {
        console.log(`[GraphQL Gateway] Running at http://localhost:${PORT}/graphql`);
    });
};

startServer().catch(err => {
    console.error('[GraphQL Gateway] Error during startup:', err);
});
