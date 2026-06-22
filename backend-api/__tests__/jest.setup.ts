/**
 * Global test environment setup (runs before each test file).
 *
 * Ensures deterministic env vars so middleware/services that read
 * process.env behave predictably under test. In particular the auth
 * middleware verifies tokens against `process.env.JWT_SECRET`.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_stuffy';
// Keep flash-sale / external integrations from reaching the network in tests.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'mock_gemini_key';
