import http from 'http';
import dotenv from 'dotenv';
import app from './app';
import logger from './config/logger';
import { startIndexerLagMonitor } from './services/monitorService';
import {
  initializeSocketServer,
  TypedServer,
} from './sockets/connectionHandler';
import { startEscrowMonitorJob, stopEscrowMonitorJob } from './jobs/escrowMonitor';
import { startEventPoller, stopEventPoller } from './services/eventPoller';
import { connectRedis, disconnectRedis } from './config/redis';

dotenv.config();

const PORT = process.env.PORT || 8000;

const httpServer = http.createServer(app);
const io: TypedServer = initializeSocketServer(httpServer);

httpServer.listen(PORT, () => {
  logger.info(
    `🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`
  );
  logger.info(`📝 Health check: http://localhost:${PORT}/health`);
  logger.info(`📦 ETA endpoint: http://localhost:${PORT}/api/v1/deliveries/:id/eta`);

  startIndexerLagMonitor();
});

if (process.env.NODE_ENV !== 'test') {
  startEscrowMonitorJob();
  startEventPoller();
  void connectRedis().catch((error) => {
    logger.error('Failed to connect to Redis:', error);
  });
}

const gracefulShutdown = (): void => {
  logger.info('Shutting down gracefully...');
  stopEventPoller();
  stopEscrowMonitorJob();
  shutdownSocketServer(io)
    .catch((error) =>
      logger.error('Error shutting down Socket.IO server:', error)
    )
    .then(() => disconnectRedis())
    .catch((error) => logger.error('Error disconnecting Redis:', error))
    .finally(() => process.exit(0));
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
