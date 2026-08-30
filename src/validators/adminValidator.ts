import ApiError from '../utils/ApiError';
import { USER_ROLES, UserRole } from '../models/User';

const MAX_REASON_LENGTH = 500;

/** Ensures the parsed body is a JSON object before reading fields off it. */
const asObject = (body: unknown): Record<string, unknown> => {
  if (body === undefined || body === null) {
    return {};
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
};

/**
 * Validates the optional free-text justification attached to an admin action.
 *
 * The reason is stored verbatim on the audit entry, so it is length-capped
 * here to match the schema rather than failing later at write time.
 */
export const validateActionReason = (body: unknown): string | undefined => {
  const { reason } = asObject(body);

  if (reason === undefined || reason === null || reason === '') {
    return undefined;
  }

  if (typeof reason !== 'string') {
    throw ApiError.badRequest('`reason` must be a string');
  }

  const trimmed = reason.trim();
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw ApiError.badRequest(`\`reason\` must not exceed ${MAX_REASON_LENGTH} characters`);
  }

  return trimmed === '' ? undefined : trimmed;
};

/** Validates a role-change request body. */
export const validateRoleChangeInput = (
  body: unknown,
): { role: UserRole; reason: string | undefined } => {
  const { role } = asObject(body);

  if (typeof role !== 'string' || !USER_ROLES.includes(role as UserRole)) {
    throw ApiError.badRequest(`\`role\` must be one of: ${USER_ROLES.join(', ')}`);
  }

  return { role: role as UserRole, reason: validateActionReason(body) };
};

export default { validateActionReason, validateRoleChangeInput };
