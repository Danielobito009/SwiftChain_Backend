import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../../src/models/User';
import { Delivery, DeliveryStatus } from '../../src/models/Delivery';
import { UserRole } from '../../src/interfaces/IUser';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const MONGODB_URI =
  process.env.LOAD_TEST_MONGODB_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/swiftchain';

const DRIVER_COUNT = parseInt(process.env.LOAD_TEST_DRIVER_COUNT || '25', 10);
const CUSTOMER_COUNT = parseInt(process.env.LOAD_TEST_CUSTOMER_COUNT || '25', 10);
const DELIVERY_COUNT = parseInt(process.env.LOAD_TEST_DELIVERY_COUNT || '50', 10);
const SHARED_PASSWORD = process.env.LOAD_TEST_USER_PASSWORD || 'LoadTest#12345';

const OUTPUT_DIR = path.resolve(__dirname, '../.tmp');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'seed-output.json');

const EMAIL_PATTERN = /^loadtest\.(driver|customer)\./;

interface SeededAccount {
  id: string;
  email: string;
}

interface SeededDelivery {
  id: string;
}

/**
 * Model-layer seeding: writes real documents into MongoDB through the
 * application's own Mongoose models (User, Delivery). Load test scenarios
 * consume this data via the real HTTP/WebSocket API — nothing about the
 * system under test is mocked or stubbed.
 */
async function seed(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  // eslint-disable-next-line no-console
  console.log(`Connected to ${MONGODB_URI}`);

  // Remove fixtures from previous runs so re-seeding stays idempotent
  // without touching any non-load-test data.
  await User.deleteMany({ email: EMAIL_PATTERN });
  await Delivery.deleteMany({ isLoadTestFixture: true });

  const drivers: SeededAccount[] = [];
  for (let i = 0; i < DRIVER_COUNT; i += 1) {
    const email = `loadtest.driver.${i}@swiftchain.test`;
    const user = await User.create({
      email,
      password: SHARED_PASSWORD,
      firstName: 'LoadDriver',
      lastName: `${i}`,
      role: UserRole.DRIVER,
      isActive: true,
    });
    drivers.push({ id: String(user._id), email });
  }

  const customers: SeededAccount[] = [];
  for (let i = 0; i < CUSTOMER_COUNT; i += 1) {
    const email = `loadtest.customer.${i}@swiftchain.test`;
    const user = await User.create({
      email,
      password: SHARED_PASSWORD,
      firstName: 'LoadCustomer',
      lastName: `${i}`,
      role: UserRole.USER,
      isActive: true,
    });
    customers.push({ id: String(user._id), email });
  }

  const deliveries: SeededDelivery[] = [];
  for (let i = 0; i < DELIVERY_COUNT; i += 1) {
    const driver = drivers[i % drivers.length];
    const customer = customers[i % customers.length];

    const delivery = await Delivery.create({
      deliveryId: `LOADTEST-${Date.now()}-${i}`,
      driverId: driver.id,
      userId: customer.id,
      isLoadTestFixture: true,
      customer: {
        name: `Load Customer ${i}`,
        phone: '+10000000000',
      },
      pickup: {
        address: `${100 + i} Load Test Ave`,
        city: 'Testville',
      },
      dropoff: {
        address: `${200 + i} Load Test Ave`,
        city: 'Testville',
      },
      package: {
        description: 'Load test package',
        weight: 1 + (i % 10),
      },
      pickupCoordinates: {
        lat: 40.7128 + i * 0.001,
        lng: -74.006 + i * 0.001,
        address: `${100 + i} Load Test Ave`,
      },
      dropoffCoordinates: {
        lat: 40.758 + i * 0.001,
        lng: -73.9855 + i * 0.001,
        address: `${200 + i} Load Test Ave`,
      },
      status: DeliveryStatus.ASSIGNED,
    });

    deliveries.push({ id: String(delivery._id) });
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify({ password: SHARED_PASSWORD, drivers, customers, deliveries }, null, 2),
  );

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${drivers.length} drivers, ${customers.length} customers, ${deliveries.length} deliveries.`,
  );
  // eslint-disable-next-line no-console
  console.log(`Fixtures written to ${OUTPUT_FILE}`);

  await mongoose.disconnect();
}

seed().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed load test data:', error);
  process.exitCode = 1;
});
