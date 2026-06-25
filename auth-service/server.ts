import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { schema } from './schema';
import authRoutes from './routes/auth';

const app = express();

const apolloServer = new ApolloServer({
  schema,
  introspection: true,
});

async function startServer() {
  await apolloServer.start();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.use('/graphql', expressMiddleware(apolloServer, {
    context: async ({ req }) => ({
      userId: req.headers['x-user-id'] as string || null,
    }),
  }) as any);

  app.use('/api/auth', authRoutes);

  const mongoURI = process.env.MONGO_URI || 'mongodb://mongodb:27017/stuffy_db';
  await mongoose.connect(mongoURI);
  console.log('[Auth Service] MongoDB connected.');

  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => {
    console.log(`[Auth Service] Running at http://localhost:${PORT}`);
  });
}

startServer().catch(err => console.error('[Auth Service] Start Error:', err));
