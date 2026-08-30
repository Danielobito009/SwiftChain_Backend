import request from 'supertest';
import SwaggerParser from '@apidevtools/swagger-parser';
import app from '../src/app';
import { buildSwaggerSpec } from '../src/docs/swagger';
import { AUDIT_ACTIONS } from '../src/models/AuditLog';
import { USER_ROLES } from '../src/models/User';

jest.mock('../src/config/database', () => ({ connectDatabase: jest.fn() }));

jest.mock('../src/config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

/** Shape of the assembled document, narrowed to what these tests assert on. */
interface SpecShape {
  openapi: string;
  info: { title: string };
  servers: Array<{ url: string }>;
  security: unknown;
  components: {
    schemas: Record<string, { properties: Record<string, { enum?: string[] }> }>;
  };
  paths: Record<
    string,
    Record<
      string,
      { security?: unknown[]; responses: object; parameters?: Array<{ $ref?: string }> }
    >
  >;
}

describe('OpenAPI specification', () => {
  const spec = buildSwaggerSpec() as unknown as SpecShape;

  it('is a valid OpenAPI 3.0 document', async () => {
    // Validates the structure and resolves every $ref, so a typo in a
    // component reference fails the build rather than surfacing as a broken
    // documentation page.
    await expect(SwaggerParser.validate(JSON.parse(JSON.stringify(spec)))).resolves.toBeDefined();
  });

  it('declares the OpenAPI version and API metadata', () => {
    expect(spec.openapi).toMatch(/^3\.0/);
    expect(spec.info).toMatchObject({ title: 'SwiftChain Backend API' });
  });

  it('advertises a versioned server base path', () => {
    const servers = spec.servers as Array<{ url: string }>;

    expect(servers.length).toBeGreaterThan(0);
    servers.forEach((server) => expect(server.url).toContain('/api/v1'));
  });

  it('documents every REST endpoint the router exposes', () => {
    const documented = Object.keys(spec.paths);

    expect(documented).toEqual(
      expect.arrayContaining([
        '/auth/register',
        '/auth/login',
        '/users',
        '/users/{userId}',
        '/users/{userId}/suspend',
        '/users/{userId}/reinstate',
        '/users/{userId}/role',
        '/deliveries',
        '/deliveries/{deliveryId}',
        '/escrows',
        '/escrows/{escrowId}',
        '/escrows/{escrowId}/refund',
        '/escrows/{escrowId}/release',
        '/audit-logs',
        '/audit-logs/{targetType}/{targetId}',
      ]),
    );
  });

  it('applies bearer authentication globally and exempts the public auth routes', () => {
    expect(spec.security).toEqual([{ bearerAuth: [] }]);

    const { paths } = spec;
    expect(paths['/auth/login'].post.security).toEqual([]);
    expect(paths['/auth/register'].post.security).toEqual([]);
  });

  it('documents the 429 response on rate limited endpoints', () => {
    const { paths } = spec;

    expect(paths['/auth/login'].post.responses).toHaveProperty('429');
    expect(paths['/escrows/{escrowId}/refund'].post.responses).toHaveProperty('429');
  });

  it('documents pagination parameters on collection endpoints', () => {
    const { paths } = spec;

    const refs = (paths['/deliveries'].get.parameters ?? []).map((param) => param.$ref);

    expect(refs).toEqual(
      expect.arrayContaining([
        '#/components/parameters/PageParam',
        '#/components/parameters/LimitParam',
        '#/components/parameters/SortParam',
      ]),
    );
  });

  it('derives enumerations from the models so the docs cannot drift', () => {
    const { schemas } = spec.components;

    expect(schemas.User.properties.role.enum).toEqual([...USER_ROLES]);
    expect(schemas.AuditLog.properties.action.enum).toEqual([...AUDIT_ACTIONS]);
  });

  it('never exposes the password field on the User schema', () => {
    const { schemas } = spec.components;

    expect(schemas.User.properties).not.toHaveProperty('password');
  });
});

describe('Documentation endpoints', () => {
  it('serves the raw specification as JSON', async () => {
    const { body } = await request(app).get('/api-docs.json').expect(200);

    expect(body.openapi).toMatch(/^3\.0/);
    expect(body.paths).toHaveProperty('/auth/login');
  });

  it('serves the Swagger UI at /api-docs', async () => {
    const response = await request(app).get('/api-docs/').expect(200);

    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.text).toContain('SwiftChain API Documentation');
  });
});
