import jwt, { SignOptions } from 'jsonwebtoken';
import User from '../models/User';
import ApiError from '../utils/ApiError';
import { JwtPayload } from '../types/auth';

const DEFAULT_JWT_EXPIRES_IN = '7d';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: Record<string, unknown>;
  token: string;
}

/** Reads the signing secret, failing fast on a misconfigured deployment. */
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new ApiError(500, 'JWT_SECRET is not configured', false);
  }
  return secret;
};

/** Issues a signed access token for the given principal. */
const issueToken = (payload: JwtPayload): string => {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? DEFAULT_JWT_EXPIRES_IN) as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, getJwtSecret(), options);
};

/**
 * Registers a new user.
 *
 * The password is hashed by the model's pre-save hook, and the returned
 * representation never exposes the hash.
 *
 * @throws {ApiError} 409 when the email is already registered.
 */
export const registerUser = async (input: RegisterInput): Promise<AuthResult> => {
  const existingUser = await User.findOne({ email: input.email }).lean().exec();
  if (existingUser) {
    throw ApiError.conflict('A user with this email already exists');
  }

  try {
    const user = await User.create(input);

    return {
      user: user.toJSON(),
      token: issueToken({ sub: user.id as string, email: user.email, role: user.role }),
    };
  } catch (error) {
    // Guards the race where the unique index rejects a concurrent insert
    // that slipped past the existence check above.
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      throw ApiError.conflict('A user with this email already exists');
    }
    throw error;
  }
};

/**
 * Authenticates a set of credentials and issues an access token.
 *
 * Both an unknown email and a wrong password return the same message so the
 * endpoint cannot be used to enumerate which accounts exist.
 */
export const loginUser = async (input: LoginInput): Promise<AuthResult> => {
  const user = await User.findOne({ email: input.email }).select('+password').exec();

  if (!user || !(await user.comparePassword(input.password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.status === 'suspended') {
    throw ApiError.forbidden('This account has been suspended');
  }

  return {
    user: user.toJSON(),
    token: issueToken({ sub: user.id as string, email: user.email, role: user.role }),
  };
};

export default { registerUser, loginUser };
