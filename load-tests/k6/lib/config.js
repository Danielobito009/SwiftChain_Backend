import { SharedArray } from 'k6/data';

/**
 * Shared runtime configuration for all k6 scenarios, sourced from environment
 * variables (`k6 run -e KEY=value ...` or a loaded `.env`). No values here
 * are hardcoded test data — they only describe *where* to send traffic and
 * *how much*. Actual test data (user credentials, delivery ids) is read from
 * the fixtures file produced by `npm run seed`, which writes real MongoDB
 * documents through the application's own models.
 */
export const BASE_URL = `${__ENV.LOAD_TEST_BASE_URL || 'http://localhost:3000'}`;
export const API_VERSION = __ENV.LOAD_TEST_API_VERSION || 'v1';
export const API_PREFIX = `${BASE_URL}/api/${API_VERSION}`;

const FIXTURES_PATH = __ENV.LOAD_TEST_FIXTURES_PATH || '../../.tmp/seed-output.json';

/**
 * Fixtures written by `scripts/seedLoadTestData.ts`. `SharedArray` ensures
 * the JSON is parsed once and shared (read-only) across all VUs instead of
 * being duplicated in every VU's memory.
 */
export const fixtures = JSON.parse(open(FIXTURES_PATH));

export const drivers = new SharedArray('drivers', () => fixtures.drivers);
export const customers = new SharedArray('customers', () => fixtures.customers);
export const deliveries = new SharedArray('deliveries', () => fixtures.deliveries);

export const SHARED_PASSWORD = fixtures.password;

export const defaultThresholds = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<500', 'p(99)<1000'],
};

export const defaultStages = [
  { duration: '15s', target: Number(__ENV.K6_VUS || 20) },
  { duration: __ENV.K6_DURATION || '1m', target: Number(__ENV.K6_VUS || 20) },
  { duration: '15s', target: 0 },
];
