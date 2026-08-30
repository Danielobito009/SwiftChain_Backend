import ApiError from '../utils/ApiError';
import { LoginInput, RegisterInput } from '../services/authService';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 100;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Ensures the parsed body is a JSON object before reading fields off it. */
const asObject = (body: unknown): Record<string, unknown> => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw ApiError.badRequest('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
};

/**
 * Validates and normalizes the registration request body.
 *
 * @throws {ApiError} 400 describing the first validation failure.
 */
export const validateRegisterInput = (body: unknown): RegisterInput => {
  const { name, email, password } = asObject(body);

  if (!isNonEmptyString(name) || name.trim().length < MIN_NAME_LENGTH) {
    throw ApiError.badRequest(
      `Name is required and must be at least ${MIN_NAME_LENGTH} characters`,
    );
  }

  if (name.trim().length > MAX_NAME_LENGTH) {
    throw ApiError.badRequest(`Name must not exceed ${MAX_NAME_LENGTH} characters`);
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
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
  };
};

/** Validates and normalizes the login request body. */
export const validateLoginInput = (body: unknown): LoginInput => {
  const { email, password } = asObject(body);

  if (!isNonEmptyString(email) || !EMAIL_REGEX.test(email.trim())) {
    throw ApiError.badRequest('A valid email address is required');
  }

  if (!isNonEmptyString(password)) {
    throw ApiError.badRequest('Password is required');
  }

  return {
    email: email.trim().toLowerCase(),
    password,
  };
};

export default { validateRegisterInput, validateLoginInput };
