const jsonContent = (schemaRef: string): Record<string, unknown> => ({
  'application/json': { schema: { $ref: schemaRef } },
});

/** Builds the envelope returned by a paginated collection endpoint. */
const paginatedResponse = (itemRef: string, description: string): Record<string, unknown> => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          message: { type: 'string' },
          data: { type: 'array', items: { $ref: itemRef } },
          meta: { $ref: '#/components/schemas/PaginationMeta' },
        },
      },
    },
  },
});

/** Builds the envelope returned by a single-resource endpoint. */
const resourceResponse = (itemRef: string, description: string): Record<string, unknown> => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          message: { type: 'string' },
          data: { $ref: itemRef },
        },
      },
    },
  },
});

const paginationParams = [
  { $ref: '#/components/parameters/PageParam' },
  { $ref: '#/components/parameters/LimitParam' },
  { $ref: '#/components/parameters/SortParam' },
];

/** Common error responses attached to every authenticated operation. */
const authErrors = {
  401: { $ref: '#/components/responses/Unauthorized' },
  403: { $ref: '#/components/responses/Forbidden' },
};

/**
 * OpenAPI path definitions for every REST endpoint exposed under `/api/v1`.
 */
export const paths = {
  '/auth/register': {
    post: {
      tags: ['Authentication'],
      summary: 'Register a new user',
      description:
        'Creates a user account and returns an access token. Rate limited to 10 requests ' +
        'per hour per IP address to curb automated signup abuse.',
      security: [],
      requestBody: {
        required: true,
        content: jsonContent('#/components/schemas/RegisterRequest'),
      },
      responses: {
        201: {
          description: 'The user was registered successfully.',
          content: jsonContent('#/components/schemas/AuthResponse'),
        },
        400: { $ref: '#/components/responses/BadRequest' },
        409: { $ref: '#/components/responses/Conflict' },
        429: { $ref: '#/components/responses/TooManyRequests' },
      },
    },
  },

  '/auth/login': {
    post: {
      tags: ['Authentication'],
      summary: 'Authenticate and obtain an access token',
      description:
        'Verifies credentials and issues a JWT. Strictly rate limited to 5 failed attempts ' +
        'per 15 minutes, keyed by both source IP and the targeted account so that ' +
        'distributed brute-force attempts against one account are throttled. Successful ' +
        'logins do not consume the quota.',
      security: [],
      requestBody: {
        required: true,
        content: jsonContent('#/components/schemas/LoginRequest'),
      },
      responses: {
        200: {
          description: 'Authentication succeeded.',
          content: jsonContent('#/components/schemas/AuthResponse'),
        },
        400: { $ref: '#/components/responses/BadRequest' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        429: { $ref: '#/components/responses/TooManyRequests' },
      },
    },
  },

  '/users': {
    get: {
      tags: ['Users'],
      summary: 'List users',
      description:
        'Returns a paginated list of users. Supports sorting, free-text search and ' +
        'filtering by `role`, `status` and `createdAt`. Range operators are available on ' +
        'typed fields, e.g. `?createdAt[gte]=2026-01-01`.',
      parameters: [
        ...paginationParams,
        { $ref: '#/components/parameters/SearchParam' },
        {
          in: 'query',
          name: 'role',
          schema: { type: 'string', enum: ['user', 'driver', 'admin'] },
          description: 'Filter by role.',
        },
        {
          in: 'query',
          name: 'status',
          schema: { type: 'string', enum: ['active', 'suspended'] },
          description: 'Filter by account status.',
        },
      ],
      responses: {
        200: paginatedResponse('#/components/schemas/User', 'A page of users.'),
        400: { $ref: '#/components/responses/BadRequest' },
        ...authErrors,
      },
    },
  },

  '/users/{userId}': {
    get: {
      tags: ['Users'],
      summary: 'Retrieve a single user',
      parameters: [
        {
          in: 'path',
          name: 'userId',
          required: true,
          schema: { type: 'string' },
          description: 'The user identifier.',
        },
      ],
      responses: {
        200: resourceResponse('#/components/schemas/User', 'The requested user.'),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
        ...authErrors,
      },
    },
  },

  '/users/{userId}/suspend': {
    patch: {
      tags: ['Users'],
      summary: 'Suspend a user account',
      description:
        'Suspends an account, blocking further authenticated access. The action is written ' +
        'to the audit log before the change is persisted.',
      parameters: [{ in: 'path', name: 'userId', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: false,
        content: jsonContent('#/components/schemas/AdminActionRequest'),
      },
      responses: {
        200: resourceResponse('#/components/schemas/User', 'The suspended user.'),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
        ...authErrors,
      },
    },
  },

  '/users/{userId}/reinstate': {
    patch: {
      tags: ['Users'],
      summary: 'Reinstate a suspended user account',
      description: 'Restores a suspended account to active status. Recorded in the audit log.',
      parameters: [{ in: 'path', name: 'userId', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: false,
        content: jsonContent('#/components/schemas/AdminActionRequest'),
      },
      responses: {
        200: resourceResponse('#/components/schemas/User', 'The reinstated user.'),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
        ...authErrors,
      },
    },
  },

  '/users/{userId}/role': {
    patch: {
      tags: ['Users'],
      summary: "Change a user's role",
      description: 'Updates a role and records the previous and new value on the audit entry.',
      parameters: [{ in: 'path', name: 'userId', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: jsonContent('#/components/schemas/RoleChangeRequest'),
      },
      responses: {
        200: resourceResponse('#/components/schemas/User', 'The updated user.'),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
        ...authErrors,
      },
    },
  },

  '/deliveries': {
    get: {
      tags: ['Deliveries'],
      summary: 'List deliveries',
      description:
        'Returns a paginated list of deliveries. Supports sorting, free-text search across ' +
        'the reference and addresses, and filtering by status, currency, amount, sender, ' +
        'courier and creation date. Range operators such as `?amount[gte]=100` are supported.',
      parameters: [
        ...paginationParams,
        { $ref: '#/components/parameters/SearchParam' },
        {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
            enum: ['pending', 'accepted', 'in_transit', 'delivered', 'cancelled', 'disputed'],
          },
          description: 'Filter by delivery status.',
        },
        {
          in: 'query',
          name: 'amount[gte]',
          schema: { type: 'number' },
          description: 'Return deliveries worth at least this amount.',
        },
      ],
      responses: {
        200: paginatedResponse('#/components/schemas/Delivery', 'A page of deliveries.'),
        400: { $ref: '#/components/responses/BadRequest' },
        ...authErrors,
      },
    },
  },

  '/deliveries/{deliveryId}': {
    get: {
      tags: ['Deliveries'],
      summary: 'Retrieve a single delivery',
      parameters: [{ in: 'path', name: 'deliveryId', required: true, schema: { type: 'string' } }],
      responses: {
        200: resourceResponse('#/components/schemas/Delivery', 'The requested delivery.'),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
        ...authErrors,
      },
    },
  },

  '/escrows': {
    get: {
      tags: ['Escrow'],
      summary: 'List escrow records',
      description:
        'Returns a paginated list of escrow records. All escrow endpoints are rate limited ' +
        'to 30 requests per 15 minutes per client.',
      parameters: [
        ...paginationParams,
        {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
            enum: ['pending', 'funded', 'released', 'refunded', 'disputed'],
          },
          description: 'Filter by escrow status.',
        },
      ],
      responses: {
        200: paginatedResponse('#/components/schemas/Escrow', 'A page of escrow records.'),
        400: { $ref: '#/components/responses/BadRequest' },
        429: { $ref: '#/components/responses/TooManyRequests' },
        ...authErrors,
      },
    },
  },

  '/escrows/{escrowId}': {
    get: {
      tags: ['Escrow'],
      summary: 'Retrieve a single escrow record',
      parameters: [{ in: 'path', name: 'escrowId', required: true, schema: { type: 'string' } }],
      responses: {
        200: resourceResponse('#/components/schemas/Escrow', 'The requested escrow record.'),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
        429: { $ref: '#/components/responses/TooManyRequests' },
        ...authErrors,
      },
    },
  },

  '/escrows/{escrowId}/refund': {
    post: {
      tags: ['Escrow'],
      summary: 'Refund a held escrow to the payer',
      description:
        'Settles an escrow back to the payer. Irreversible, so it is restricted to admins, ' +
        'limited to 10 requests per hour, and written to the audit log before the funds ' +
        'transition state.',
      parameters: [{ in: 'path', name: 'escrowId', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: false,
        content: jsonContent('#/components/schemas/AdminActionRequest'),
      },
      responses: {
        200: resourceResponse('#/components/schemas/Escrow', 'The refunded escrow record.'),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
        429: { $ref: '#/components/responses/TooManyRequests' },
        ...authErrors,
      },
    },
  },

  '/escrows/{escrowId}/release': {
    post: {
      tags: ['Escrow'],
      summary: 'Release a held escrow to the payee',
      description:
        'Settles an escrow to the payee. Irreversible, so it is restricted to admins, ' +
        'limited to 10 requests per hour, and written to the audit log before the funds ' +
        'transition state.',
      parameters: [{ in: 'path', name: 'escrowId', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: false,
        content: jsonContent('#/components/schemas/AdminActionRequest'),
      },
      responses: {
        200: resourceResponse('#/components/schemas/Escrow', 'The released escrow record.'),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
        429: { $ref: '#/components/responses/TooManyRequests' },
        ...authErrors,
      },
    },
  },

  '/audit-logs': {
    get: {
      tags: ['Audit Logs'],
      summary: 'List administrative audit entries',
      description:
        'Returns a paginated view of the administrative audit trail, newest first. ' +
        'Entries are append-only and cannot be modified or deleted through the API.',
      parameters: [
        ...paginationParams,
        {
          in: 'query',
          name: 'action',
          schema: { type: 'string' },
          description: 'Filter by action type, e.g. `user.suspended`.',
        },
        {
          in: 'query',
          name: 'admin',
          schema: { type: 'string' },
          description: 'Filter by the acting admin identifier.',
        },
        {
          in: 'query',
          name: 'createdAt[gte]',
          schema: { type: 'string', format: 'date-time' },
          description: 'Return entries recorded on or after this timestamp.',
        },
      ],
      responses: {
        200: paginatedResponse('#/components/schemas/AuditLog', 'A page of audit entries.'),
        400: { $ref: '#/components/responses/BadRequest' },
        ...authErrors,
      },
    },
  },

  '/audit-logs/{targetType}/{targetId}': {
    get: {
      tags: ['Audit Logs'],
      summary: 'Retrieve the audit trail for a single record',
      parameters: [
        {
          in: 'path',
          name: 'targetType',
          required: true,
          schema: { type: 'string', enum: ['User', 'Delivery', 'Escrow'] },
        },
        { in: 'path', name: 'targetId', required: true, schema: { type: 'string' } },
        ...paginationParams,
      ],
      responses: {
        200: paginatedResponse(
          '#/components/schemas/AuditLog',
          'A page of audit entries for the target record.',
        ),
        400: { $ref: '#/components/responses/BadRequest' },
        ...authErrors,
      },
    },
  },
} as const;

export default paths;
