/**
 * Smoke test for the replica-set configuration constraint (Task 6.3).
 *
 * MongoDB multi-document transactions (used by POST /api/orders) require the
 * database to run as a replica set. This test verifies two things:
 *
 *  - Part 1 (Req 5.1): the test environment boots a MongoDB replica set, so
 *    transaction-based code paths are actually exercisable. We assert the
 *    connection URI advertises a `replicaSet=` parameter.
 *  - Part 2 (Req 5.3): the project configuration records the replica-set
 *    constraint. We assert `docker-compose.yml` runs mongod with `--replSet rs0`
 *    and points backend-api's MONGO_URI at `replicaSet=rs0`, and that
 *    `backend-api/.env.example` documents the same `replicaSet=rs0` constraint.
 *
 * _Requirements: 5.1, 5.3_
 */
import fs from 'fs';
import path from 'path';
import * as mongoServer from './helpers/mongoTestServer';

// Repo root is two levels up from this test file (backend-api/__tests__).
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DOCKER_COMPOSE_PATH = path.join(REPO_ROOT, 'docker-compose.yml');
const ENV_EXAMPLE_PATH = path.resolve(__dirname, '..', '.env.example');

beforeAll(async () => {
  await mongoServer.connect();
});

afterAll(async () => {
  await mongoServer.disconnect();
});

describe('replica set constraint (Req 5.1): test environment', () => {
  it('boots a mongo replica set whose URI advertises replicaSet=', () => {
    const uri = mongoServer.getUri();
    expect(uri).toBeTruthy();
    expect(uri).toContain('replicaSet=');
  });
});

describe('replica set constraint (Req 5.3): project configuration', () => {
  it('docker-compose.yml runs mongod as a replica set named rs0', () => {
    const compose = fs.readFileSync(DOCKER_COMPOSE_PATH, 'utf8');
    expect(compose).toContain('--replSet');
    expect(compose).toContain('rs0');
  });

  it("docker-compose.yml sets backend-api MONGO_URI with replicaSet=rs0", () => {
    const compose = fs.readFileSync(DOCKER_COMPOSE_PATH, 'utf8');
    // backend-api's MONGO_URI must carry the replica-set query param.
    expect(compose).toMatch(/MONGO_URI=mongodb:\/\/[^\s]*replicaSet=rs0/);
  });

  it('.env.example documents MONGO_URI with replicaSet=rs0', () => {
    const env = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
    expect(env).toMatch(/MONGO_URI=mongodb:\/\/[^\s]*replicaSet=rs0/);
  });
});
