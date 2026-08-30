import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { connectDatabase } from './config/database';
import logger from './config/logger';
import errorHandler from './middlewares/errorHandler';
import { globalLimiter } from './middlewares/rateLimiter';
import { setupSwagger } from './docs/swagger';
import routes from './routes';

const app = express();

// Rate limiting and request logging rely on the real client IP. Behind a
// load balancer or reverse proxy that address only appears in
// `X-Forwarded-For`, so the hop count is configurable rather than blindly
// trusting the header, which would let clients spoof their way past limits.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  const hops = Number(trustProxy);
  app.set('trust proxy', Number.isFinite(hops) ? hops : trustProxy);
}

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  }),
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'SwiftChain-Backend is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API documentation. Mounted before the rate limiter so that browsing the
// docs never consumes a caller's request budget.
setupSwagger(app);

// Baseline rate limit for the whole API surface. Route-specific limiters
// mounted inside the routers are stricter and run after this one.
app.use('/api', globalLimiter);

// API routes
app.use('/api/v1', routes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use(errorHandler);

// Database connection
connectDatabase();

export default app;
