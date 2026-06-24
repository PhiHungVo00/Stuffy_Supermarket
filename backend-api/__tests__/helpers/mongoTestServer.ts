/**
 * MongoDB test server helper.
 *
 * MongoDB multi-document transactions require a replica set. This helper
 * boots an in-memory MongoDB replica set (single node) via
 * `mongodb-memory-server` so transaction-based code paths can be exercised
 * in isolation without a real cluster.
 *
 * Usage in a test file:
 *
 *   import * as mongoServer from '../helpers/mongoTestServer';
 *
 *   beforeAll(async () => { await mongoServer.connect(); });
 *   afterEach(async () => { await mongoServer.clearAll(); });
 *   afterAll(async () => { await mongoServer.disconnect(); });
 */
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | null = null;

/**
 * Boots a single-node replica set and connects the default mongoose
 * connection to it. Idempotent: repeated calls reuse the running set.
 * Returns the connection URI (includes `replicaSet=`).
 */
export async function connect(): Promise<string> {
  if (replSet) {
    return replSet.getUri();
  }

  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  const uri = replSet.getUri();
  await mongoose.connect(uri, { dbName: 'jest_transactional_orders' });
  return uri;
}

/**
 * Removes all documents from every collection without dropping indexes.
 * Call between tests to guarantee isolation.
 */
export async function clearAll(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

/**
 * Disconnects mongoose and stops the in-memory replica set.
 * Safe to call even if `connect()` was never invoked.
 */
export async function disconnect(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect();
  }
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
}

/** Returns the running replica set URI, or null if not started. */
export function getUri(): string | null {
  return replSet ? replSet.getUri() : null;
}
