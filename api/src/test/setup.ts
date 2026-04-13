// Jest setupFiles: runs before each test file's module loading.
// Forces all client.ts pool connections to use krishnabyrr_test.
process.env.DB_NAME = 'krishnabyrr_test';
process.env.DB_USER = process.env.DB_USER ?? 'vijayagarwal';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.REDIS_URL = 'redis://localhost:6379';
