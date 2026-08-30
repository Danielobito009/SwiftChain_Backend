import { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { parameters, responses, schemas, securitySchemes } from './components';
import paths from './paths';
import logger from '../config/logger';

const DOCS_ROUTE = '/api-docs';
const SPEC_ROUTE = '/api-docs.json';
const API_BASE_PATH = '/api/v1';

/**
 * Resolves the servers block advertised in the specification.
 *
 * `API_PUBLIC_URL` lets a deployed environment advertise its own origin so
 * that "Try it out" targets the right host; local development falls back to
 * the configured port.
 */
const resolveServers = (): Array<{ url: string; description: string }> => {
  const port = process.env.PORT ?? '3000';
  const servers: Array<{ url: string; description: string }> = [];

  const publicUrl = process.env.API_PUBLIC_URL?.trim();
  if (publicUrl) {
    servers.push({
      url: `${publicUrl.replace(/\/+$/, '')}${API_BASE_PATH}`,
      description: 'Configured deployment',
    });
  }

  servers.push({
    url: `http://localhost:${port}${API_BASE_PATH}`,
    description: 'Local development',
  });

  return servers;
};

/**
 * The assembled OpenAPI 3.0 document.
 *
 * Built programmatically rather than from JSDoc annotations so that the
 * enumerations stay derived from the Mongoose models and the whole document
 * is type-checked at build time.
 */
export const buildSwaggerSpec = (): Record<string, unknown> => ({
  openapi: '3.0.3',
  info: {
    title: 'SwiftChain Backend API',
    version: process.env.npm_package_version ?? '1.0.0',
    description:
      'REST API for SwiftChain, a blockchain-powered logistics and escrow delivery ' +
      'platform.\n\n' +
      '## Authentication\n' +
      'Most endpoints require a JWT. Obtain one from `POST /auth/login` and send it as ' +
      '`Authorization: Bearer <token>`.\n\n' +
      '## Rate limiting\n' +
      'Every response carries the standard `RateLimit-*` headers. Exceeding a limit ' +
      'returns `429 Too Many Requests` together with a `Retry-After` header. ' +
      'Authentication and escrow settlement endpoints enforce tighter limits than the ' +
      'API-wide default.\n\n' +
      '## Pagination\n' +
      'Collection endpoints accept `page`, `limit` and `sort`, and return a `meta` object ' +
      'describing the total item and page counts. Filters may use the comparison ' +
      'operators `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in` and `nin` in bracket notation, ' +
      'for example `?amount[gte]=100&status[in]=pending,accepted`.',
    license: { name: 'MIT' },
  },
  servers: resolveServers(),
  tags: [
    { name: 'Authentication', description: 'Registration and credential verification.' },
    { name: 'Users', description: 'User directory and administrative account actions.' },
    { name: 'Deliveries', description: 'Delivery records and their lifecycle.' },
    { name: 'Escrow', description: 'Escrow records and settlement operations.' },
    { name: 'Audit Logs', description: 'Immutable trail of administrative actions.' },
  ],
  components: { schemas, parameters, responses, securitySchemes },
  // Applied to every operation unless overridden with `security: []`.
  security: [{ bearerAuth: [] }],
  paths,
});

const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  customSiteTitle: 'SwiftChain API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'list',
    filter: true,
  },
};

/**
 * Mounts the Swagger UI at `/api-docs` and the raw specification at
 * `/api-docs.json`.
 *
 * The raw document is exposed separately so that client generators and
 * contract tests can consume it without scraping the UI.
 */
export const setupSwagger = (app: Express): void => {
  const spec = buildSwaggerSpec();

  app.get(SPEC_ROUTE, (_req: Request, res: Response) => {
    res.status(200).json(spec);
  });

  app.use(DOCS_ROUTE, swaggerUi.serve, swaggerUi.setup(spec, swaggerUiOptions));

  logger.info(`API documentation available at ${DOCS_ROUTE}`);
};

export default setupSwagger;
