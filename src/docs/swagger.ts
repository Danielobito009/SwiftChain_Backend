import path from 'path';
import swaggerJSDoc from 'swagger-jsdoc';
import env from '../config/env';

/**
 * OpenAPI 3.0 definition for the SwiftChain Backend API.
 *
 * Route-level path/operation definitions live as JSDoc `@openapi` blocks
 * directly above each Express route handler (see src/routes/*.ts), which
 * swagger-jsdoc scans via the `apis` glob below. Shared schemas/responses
 * live in `components` here so route files can `$ref` them instead of
 * repeating shapes.
 */
const swaggerDefinition: swaggerJSDoc.SwaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'SwiftChain Backend API',
    version: '1.0.0',
    description:
      'REST API for the SwiftChain delivery platform: authentication, delivery lifecycle management, delivery status tracking, and admin user management.',
  },
  servers: [
    {
      url: `http://localhost:${env.PORT}/api`,
      description: `${env.NODE_ENV} server`,
    },
  ],
  tags: [
    { name: 'Auth', description: 'User registration and authentication' },
    { name: 'Deliveries', description: 'Delivery creation, lifecycle, and archival' },
    { name: 'Delivery Status', description: 'Driver-facing delivery status transitions' },
    { name: 'Admin', description: 'Administrative user management' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'error' },
          message: { type: 'string', example: 'Something went wrong' },
        },
        required: ['status', 'message'],
      },
      ValidationErrorResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'error' },
          statusCode: { type: 'integer', example: 400 },
          message: { type: 'string', example: 'Validation failed' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'email' },
                message: { type: 'string', example: 'Please provide a valid email address' },
              },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6512f1a2b3c4d5e6f7890abc' },
          email: { type: 'string', format: 'email', example: 'user@swiftchain.com' },
          firstName: { type: 'string', example: 'Grace' },
          lastName: { type: 'string', example: 'Hopper' },
          role: { type: 'string', enum: ['user', 'driver', 'admin'], example: 'user' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['firstName', 'lastName', 'email', 'password'],
        properties: {
          firstName: { type: 'string', minLength: 2, example: 'Grace' },
          lastName: { type: 'string', minLength: 2, example: 'Hopper' },
          email: { type: 'string', format: 'email', example: 'grace.hopper@swiftchain.com' },
          password: {
            type: 'string',
            format: 'password',
            minLength: 8,
            example: 'CompileThis123!',
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'grace.hopper@swiftchain.com' },
          password: { type: 'string', format: 'password', example: 'CompileThis123!' },
        },
      },
      AuthSuccessResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          message: { type: 'string', example: 'Login successful' },
          data: {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' },
              token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            },
          },
        },
      },
      RegisterSuccessResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          message: { type: 'string', example: 'User registered successfully' },
          data: {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' },
            },
          },
        },
      },
      DeliveryLocation: {
        type: 'object',
        required: ['address'],
        properties: {
          address: { type: 'string', example: '123 Pickup St' },
          city: { type: 'string', example: 'New York' },
          state: { type: 'string', example: 'NY' },
          zipCode: { type: 'string', example: '10001' },
          instructions: { type: 'string', example: 'Ring bell' },
        },
      },
      DeliveryPackage: {
        type: 'object',
        required: ['description', 'weight'],
        properties: {
          description: { type: 'string', example: 'Electronics' },
          weight: { type: 'number', example: 2.5 },
          size: { type: 'string', example: 'Medium' },
          isFragile: { type: 'boolean', example: true },
          requiresSignature: { type: 'boolean', example: true },
        },
      },
      CreateDeliveryRequest: {
        type: 'object',
        required: ['trackingNumber', 'customer', 'pickup', 'dropoff', 'package'],
        properties: {
          trackingNumber: { type: 'string', example: 'SWIFT-001' },
          customer: {
            type: 'object',
            required: ['name', 'phone'],
            properties: {
              name: { type: 'string', example: 'John Doe' },
              phone: { type: 'string', example: '+1234567890' },
              email: { type: 'string', format: 'email', example: 'john@example.com' },
            },
          },
          pickup: { $ref: '#/components/schemas/DeliveryLocation' },
          dropoff: { $ref: '#/components/schemas/DeliveryLocation' },
          package: { $ref: '#/components/schemas/DeliveryPackage' },
          deliveryFee: { type: 'number', example: 15.99 },
          escrowAmount: { type: 'number', example: 150.0 },
          notes: { type: 'string', example: 'Leave at front desk' },
        },
      },
      UpdateDeliveryRequest: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'],
          },
          driver: { type: 'string', example: '6512f1a2b3c4d5e6f7890abc' },
          estimatedDistance: { type: 'number', example: 12.4 },
          estimatedDuration: { type: 'number', example: 35 },
          stellarTransactionId: { type: 'string', example: 'a1b2c3d4e5f6...' },
          notes: { type: 'string', example: 'Driver en route' },
        },
      },
      Delivery: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6512f1a2b3c4d5e6f7890abc' },
          trackingNumber: { type: 'string', example: 'SWIFT-001' },
          status: {
            type: 'string',
            enum: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'],
          },
          customer: { type: 'object' },
          pickup: { $ref: '#/components/schemas/DeliveryLocation' },
          dropoff: { $ref: '#/components/schemas/DeliveryLocation' },
          package: { $ref: '#/components/schemas/DeliveryPackage' },
          deliveryFee: { type: 'number', example: 15.99 },
          escrowAmount: { type: 'number', example: 150.0 },
          isDeleted: { type: 'boolean', example: false },
          deletedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      DeliveryListResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/Delivery' },
          },
          meta: {
            type: 'object',
            properties: {
              total: { type: 'integer', example: 42 },
              page: { type: 'integer', example: 1 },
              limit: { type: 'integer', example: 10 },
              totalPages: { type: 'integer', example: 5 },
            },
          },
        },
      },
      DeliveryResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: { $ref: '#/components/schemas/Delivery' },
          message: { type: 'string', example: 'Delivery archived successfully' },
        },
      },
      UpdateDeliveryStatusRequest: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered'],
            example: 'assigned',
          },
        },
      },
      SuspendUserRequest: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', example: 'Repeated policy violations' },
          ban: { type: 'boolean', example: false },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Missing, malformed, invalid, or expired authorization token',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
        },
      },
      Forbidden: {
        description: 'Authenticated but not permitted to perform this action',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
        },
      },
      ValidationError: {
        description: 'Request failed validation',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } },
        },
      },
    },
  },
};

// swagger-jsdoc parses comments straight out of the route source files, so
// point it at compiled .js when running from dist/ (comments are stripped
// by tsc) and at .ts when running under ts-node/ts-jest in development.
// path.join is required here (rather than string templating) so the glob
// swagger-jsdoc builds internally uses consistent path separators on Windows.
const routeFileExtension = __filename.endsWith('.ts') ? 'ts' : 'js';
const routesDir = path.join(__dirname, '..', 'routes');

const swaggerOptions: swaggerJSDoc.Options = {
  definition: swaggerDefinition,
  apis: [
    path.join(routesDir, `authRoutes.${routeFileExtension}`),
    path.join(routesDir, `delivery.routes.${routeFileExtension}`),
    path.join(routesDir, `deliveries.${routeFileExtension}`),
    path.join(routesDir, `adminRoutes.${routeFileExtension}`),
  ],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

export default swaggerSpec;
