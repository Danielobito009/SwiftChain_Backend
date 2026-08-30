import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../models/AuditLog';
import { DELIVERY_STATUSES } from '../models/Delivery';
import { ESCROW_STATUSES } from '../models/Escrow';
import { USER_ROLES, USER_STATUSES } from '../models/User';

/**
 * Reusable OpenAPI schema objects.
 *
 * Enumerations are derived from the Mongoose models rather than restated
 * here, so the published documentation cannot drift from what the API
 * actually accepts.
 */
export const schemas = {
  ApiSuccess: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'success' },
      message: { type: 'string', example: 'Request completed successfully' },
    },
  },

  ApiError: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'error' },
      statusCode: { type: 'integer', example: 400 },
      message: { type: 'string', example: 'A valid email address is required' },
    },
  },

  PaginationMeta: {
    type: 'object',
    description: 'Pagination metadata returned with every paginated collection.',
    properties: {
      totalItems: { type: 'integer', example: 137 },
      totalPages: { type: 'integer', example: 7 },
      currentPage: { type: 'integer', example: 2 },
      limit: { type: 'integer', example: 20 },
      hasNextPage: { type: 'boolean', example: true },
      hasPreviousPage: { type: 'boolean', example: true },
      nextPage: { type: 'integer', nullable: true, example: 3 },
      previousPage: { type: 'integer', nullable: true, example: 1 },
    },
  },

  User: {
    type: 'object',
    properties: {
      id: { type: 'string', example: '6531f3b2c1a4e8f2b7d9a105' },
      name: { type: 'string', example: 'Ada Lovelace' },
      email: { type: 'string', format: 'email', example: 'ada@swiftchain.io' },
      role: { type: 'string', enum: [...USER_ROLES], example: 'user' },
      status: { type: 'string', enum: [...USER_STATUSES], example: 'active' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  Delivery: {
    type: 'object',
    properties: {
      id: { type: 'string', example: '6531f3b2c1a4e8f2b7d9a201' },
      reference: { type: 'string', example: 'SWC-2026-0001' },
      sender: { $ref: '#/components/schemas/User' },
      courier: { allOf: [{ $ref: '#/components/schemas/User' }], nullable: true },
      pickupAddress: { type: 'string', example: '12 Marina Road, Lagos' },
      dropoffAddress: { type: 'string', example: '48 Airport Way, Abuja' },
      status: { type: 'string', enum: [...DELIVERY_STATUSES], example: 'pending' },
      amount: { type: 'number', format: 'double', example: 250.5 },
      currency: { type: 'string', example: 'XLM' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  Escrow: {
    type: 'object',
    properties: {
      id: { type: 'string', example: '6531f3b2c1a4e8f2b7d9a301' },
      delivery: { type: 'string', example: '6531f3b2c1a4e8f2b7d9a201' },
      payer: { $ref: '#/components/schemas/User' },
      payee: { $ref: '#/components/schemas/User' },
      amount: { type: 'number', format: 'double', example: 250.5 },
      currency: { type: 'string', example: 'XLM' },
      status: { type: 'string', enum: [...ESCROW_STATUSES], example: 'funded' },
      contractAddress: { type: 'string', nullable: true },
      transactionHash: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  AuditLog: {
    type: 'object',
    properties: {
      id: { type: 'string', example: '6531f3b2c1a4e8f2b7d9a401' },
      admin: { $ref: '#/components/schemas/User' },
      action: { type: 'string', enum: [...AUDIT_ACTIONS], example: 'user.suspended' },
      targetType: { type: 'string', enum: [...AUDIT_TARGET_TYPES], example: 'User' },
      targetId: { type: 'string', example: '6531f3b2c1a4e8f2b7d9a105' },
      status: { type: 'string', enum: ['success', 'failure'], example: 'success' },
      reason: { type: 'string', nullable: true, example: 'Repeated policy violations' },
      changes: {
        type: 'object',
        nullable: true,
        description: 'Field-level before/after snapshot of what the action changed.',
        additionalProperties: {
          type: 'object',
          properties: { from: {}, to: {} },
        },
        example: { status: { from: 'active', to: 'suspended' } },
      },
      ipAddress: { type: 'string', nullable: true, example: '203.0.113.24' },
      userAgent: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  RegisterRequest: {
    type: 'object',
    required: ['name', 'email', 'password'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 100, example: 'Ada Lovelace' },
      email: { type: 'string', format: 'email', example: 'ada@swiftchain.io' },
      password: { type: 'string', format: 'password', minLength: 8, example: 'S3cureP@ss' },
    },
  },

  LoginRequest: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', example: 'ada@swiftchain.io' },
      password: { type: 'string', format: 'password', example: 'S3cureP@ss' },
    },
  },

  AuthResponse: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'success' },
      message: { type: 'string', example: 'Logged in successfully' },
      data: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/User' },
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        },
      },
    },
  },

  AdminActionRequest: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        maxLength: 500,
        description: 'Optional justification stored on the resulting audit entry.',
        example: 'Repeated policy violations',
      },
    },
  },

  RoleChangeRequest: {
    type: 'object',
    required: ['role'],
    properties: {
      role: { type: 'string', enum: [...USER_ROLES], example: 'admin' },
      reason: { type: 'string', maxLength: 500, example: 'Promoted to operations admin' },
    },
  },
} as const;

/** Reusable query parameters shared by every paginated collection endpoint. */
export const parameters = {
  PageParam: {
    in: 'query',
    name: 'page',
    schema: { type: 'integer', minimum: 1, default: 1 },
    description: '1-based page number.',
  },
  LimitParam: {
    in: 'query',
    name: 'limit',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    description: 'Items per page. Values above the route maximum are clamped.',
  },
  SortParam: {
    in: 'query',
    name: 'sort',
    schema: { type: 'string' },
    description:
      'Comma-separated sort fields. Prefix a field with `-` for descending order, ' +
      'e.g. `-createdAt,name`. Unsupported fields are rejected.',
    example: '-createdAt',
  },
  SearchParam: {
    in: 'query',
    name: 'search',
    schema: { type: 'string' },
    description: 'Case-insensitive free-text search across the route searchable fields.',
  },
} as const;

/** Reusable error responses referenced across the specification. */
export const responses = {
  BadRequest: {
    description: 'The request failed validation.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  },
  Unauthorized: {
    description: 'Authentication credentials are missing or invalid.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  },
  Forbidden: {
    description: 'The authenticated caller lacks permission for this action.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  },
  NotFound: {
    description: 'The requested resource does not exist.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  },
  Conflict: {
    description: 'The request conflicts with the current state of the resource.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  },
  TooManyRequests: {
    description:
      'The client exceeded the rate limit for this endpoint. The `Retry-After` header ' +
      'indicates how long to wait before retrying.',
    headers: {
      'Retry-After': {
        schema: { type: 'integer' },
        description: 'Seconds to wait before issuing another request.',
      },
      'RateLimit-Limit': {
        schema: { type: 'integer' },
        description: 'Request quota for the current window.',
      },
      'RateLimit-Remaining': {
        schema: { type: 'integer' },
        description: 'Requests remaining in the current window.',
      },
    },
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  },
} as const;

/** JWT bearer scheme applied to every protected operation. */
export const securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Supply the token returned by `/auth/login` as `Authorization: Bearer <token>`.',
  },
} as const;
