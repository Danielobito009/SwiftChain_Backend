import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import routes from './routes';
import logger from './config/logger';
import { connectDatabase } from './config/database';
import errorHandler from './middleware/errorHandler';
import requestLogger from './middleware/requestLogger';
import env from './config/env';

dotenv.config();

const app = express();

// Trust the first proxy (load balancer / reverse proxy) so that
// secure headers and rate limiting use the correct client IP.
app.set('trust proxy', 1);

app.use(helmet());
app.use(compression());
app.use(requestLogger);

// CORS configuration
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

// Rate limiting
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api', routes);

app.get('/health', (req, res): void => {
  res.status(200).json({
    status: 'success',
    message: 'SwiftChain-Backend is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use((req, res): void => {
  res.status(404).json({
    success: false,
    error: `Route ${req.path} not found`,
  });
});

// Connect to MongoDB but don't start the server here
const connectDB = async (): Promise<void> => {
  try {
    await connectDatabase();
    logger.info('✅ Connected to MongoDB');
  } catch (error) {
    logger.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};

// Call connectDB but don't listen
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
  connectDB();
}

app.use(errorHandler);

export default app;
