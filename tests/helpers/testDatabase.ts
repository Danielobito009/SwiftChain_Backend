import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer | undefined;

/**
 * Starts an in-memory MongoDB instance and connects Mongoose to it.
 *
 * Tests exercise real Mongoose queries, indexes and validation against this
 * server rather than mocking the data layer, so the assertions reflect what
 * the API would actually return in production.
 */
export const connectTestDatabase = async (): Promise<void> => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
};

/** Drops every collection so each test starts from a known-empty state. */
export const clearTestDatabase = async (): Promise<void> => {
  const { collections } = mongoose.connection;

  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
};

/** Tears the connection and the in-memory server down. */
export const closeTestDatabase = async (): Promise<void> => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer?.stop();
};
