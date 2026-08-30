import jwt from 'jsonwebtoken';
import User, { IUserDocument, UserRole } from '../../src/models/User';
import Delivery, { DeliveryStatus, IDeliveryDocument } from '../../src/models/Delivery';
import Escrow, { EscrowStatus, IEscrowDocument } from '../../src/models/Escrow';

let sequence = 0;

/** Returns a value unique within a test run, keeping unique indexes happy. */
const nextSuffix = (): number => {
  sequence += 1;
  return sequence;
};

/** Persists a user, defaulting every field the caller does not care about. */
export const createUser = async (
  overrides: Partial<{
    name: string;
    email: string;
    password: string;
    role: UserRole;
    status: 'active' | 'suspended';
  }> = {},
): Promise<IUserDocument> => {
  const suffix = nextSuffix();

  return User.create({
    name: overrides.name ?? `Test User ${suffix}`,
    email: overrides.email ?? `user${suffix}@swiftchain.test`,
    password: overrides.password ?? 'S3cureP@ssword',
    role: overrides.role ?? 'user',
    status: overrides.status ?? 'active',
  });
};

/** Signs a token for an existing user, mirroring what the auth service issues. */
export const tokenFor = (user: IUserDocument): string =>
  jwt.sign(
    { sub: user.id as string, email: user.email, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' },
  );

/** Builds the Authorization header value for an existing user. */
export const authHeaderFor = (user: IUserDocument): string => `Bearer ${tokenFor(user)}`;

/** Persists a delivery owned by the given sender. */
export const createDelivery = async (
  sender: IUserDocument,
  overrides: Partial<{
    reference: string;
    status: DeliveryStatus;
    amount: number;
    pickupAddress: string;
    dropoffAddress: string;
  }> = {},
): Promise<IDeliveryDocument> => {
  const suffix = nextSuffix();

  return Delivery.create({
    reference: overrides.reference ?? `SWC-TEST-${suffix}`,
    sender: sender._id,
    pickupAddress: overrides.pickupAddress ?? `${suffix} Pickup Street`,
    dropoffAddress: overrides.dropoffAddress ?? `${suffix} Dropoff Avenue`,
    status: overrides.status ?? 'pending',
    amount: overrides.amount ?? 100,
  });
};

/** Persists an escrow record tied to a delivery. */
export const createEscrow = async (
  delivery: IDeliveryDocument,
  payer: IUserDocument,
  payee: IUserDocument,
  overrides: Partial<{ status: EscrowStatus; amount: number }> = {},
): Promise<IEscrowDocument> =>
  Escrow.create({
    delivery: delivery._id,
    payer: payer._id,
    payee: payee._id,
    amount: overrides.amount ?? delivery.amount,
    status: overrides.status ?? 'funded',
  });
