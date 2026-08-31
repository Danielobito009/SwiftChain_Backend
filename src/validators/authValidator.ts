import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Please provide a valid email address').toLowerCase().trim(),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
import ApiError from '../utils/ApiError';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MIN_NAME_LENGTH = 2;

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Validate and normalize the registration request body.
 *
 * Throws an {@link ApiError} (400) describing the first validation failure.
 */
export const validateRegisterInput = (body: unknown): RegisterInput => {
  if (typeof body !== 'object' || body === null) {
    throw ApiError.badRequest('Request body must be a JSON object');
  }

  const { firstName, lastName, email, password } = body as Record<string, unknown>;

  if (!isNonEmptyString(firstName) || firstName.trim().length < MIN_NAME_LENGTH) {
    throw ApiError.badRequest(
      `First name is required and must be at least ${MIN_NAME_LENGTH} characters`,
    );
  }

  if (!isNonEmptyString(lastName) || lastName.trim().length < MIN_NAME_LENGTH) {
    throw ApiError.badRequest(
      `Last name is required and must be at least ${MIN_NAME_LENGTH} characters`,
    );
  }

  if (!isNonEmptyString(email) || !EMAIL_REGEX.test(email.trim())) {
    throw ApiError.badRequest('A valid email address is required');
  }

  if (!isNonEmptyString(password) || password.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(
      `Password is required and must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }

  return {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    password,
  };
};
