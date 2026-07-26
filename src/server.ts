import http from 'http';
import dotenv from 'dotenv';
import app from './app';
import logger from './config/logger';
import {
  initializeSocketServer,
  shutdownSocketServer,
  TypedServer,
} from './sockets/connectionHandler';

dotenv.config();

const PORT = process.env.PORT || 8000;

const httpServer = http.createServer(app);
const io: TypedServer = initializeSocketServer(httpServer);

httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  logger.info(`📝 Health check: http://localhost:${PORT}/health`);
  logger.info(`📦 ETA endpoint: http://localhost:${PORT}/api/v1/deliveries/:id/eta`);
});

const gracefulShutdown = (): void => {
  logger.info('Shutting down gracefully...');
  shutdownSocketServer(io)
    .catch((error) => logger.error('Error shutting down Socket.IO server:', error))
    .finally(() => process.exit(0));
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
