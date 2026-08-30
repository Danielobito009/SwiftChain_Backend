// Environment defaults applied before any module under test is imported.
// Set here rather than in individual suites so that modules reading these at
// import time (JWT signing, rate limiter configuration) see them.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-for-suite-only';
process.env.JWT_EXPIRES_IN = '1h';
// Keep bcrypt cheap so the suite is not dominated by hashing cost.
process.env.BCRYPT_ROUNDS = '4';
