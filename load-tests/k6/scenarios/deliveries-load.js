import http from 'k6/http';
import { check, sleep, group } from 'k6';
import {
  API_PREFIX,
  drivers,
  deliveries,
  SHARED_PASSWORD,
  defaultThresholds,
  defaultStages,
} from '../lib/config.js';
import { login, authHeaders } from '../lib/authClient.js';

/**
 * Load test for the delivery CRUD + status surface:
 *   - GET  /api/v1/deliveries
 *   - GET  /api/v1/deliveries/:id
 *   - POST /api/v1/deliveries
 *   - PUT  /api/v1/deliveries/:id/status
 *
 * Reads/writes real Delivery documents seeded by `npm run seed`; no
 * responses are stubbed or mocked.
 */
export const options = {
  stages: defaultStages,
  thresholds: {
    ...defaultThresholds,
    'http_req_duration{name:DeliveriesList}': ['p(95)<600'],
  },
};

export default function () {
  const driver = drivers[__VU % drivers.length];
  const token = login(driver.email, SHARED_PASSWORD);

  if (!token) {
    sleep(1);
    return;
  }

  const auth = authHeaders(token);

  group('list deliveries', () => {
    const res = http.get(`${API_PREFIX}/deliveries?page=1&limit=20`, {
      ...auth,
      tags: { name: 'DeliveriesList' },
    });
    check(res, { 'list status is 200': (r) => r.status === 200 });
  });

  const seededDelivery = deliveries[(__VU + __ITER) % deliveries.length];

  group('get delivery by id', () => {
    const res = http.get(`${API_PREFIX}/deliveries/${seededDelivery.id}`, {
      ...auth,
      tags: { name: 'DeliveryGetById' },
    });
    check(res, { 'get by id status is 200': (r) => r.status === 200 });
  });

  group('update delivery status', () => {
    const res = http.put(
      `${API_PREFIX}/deliveries/${seededDelivery.id}/status`,
      JSON.stringify({ status: 'in_progress' }),
      { ...auth, tags: { name: 'DeliveryStatusUpdate' } },
    );
    check(res, {
      'status update is 200 or 403': (r) => r.status === 200 || r.status === 403,
    });
  });

  group('create delivery', () => {
    const res = http.post(
      `${API_PREFIX}/deliveries`,
      JSON.stringify({
        customer: { name: 'Load Test Customer', phone: '+10000000000' },
        pickup: { address: '1 Load Test Way', city: 'Testville' },
        dropoff: { address: '2 Load Test Way', city: 'Testville' },
        package: { description: 'Load test package', weight: 1.5 },
      }),
      { ...auth, tags: { name: 'DeliveryCreate' } },
    );
    check(res, { 'create status is 201': (r) => r.status === 201 });
  });

  sleep(1);
}
