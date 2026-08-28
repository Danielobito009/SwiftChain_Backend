import http from 'http';
import dotenv from 'dotenv';
import app from './app';
import logger from './config/logger';
import { startIndexerLagMonitor } from './services/monitorService';
import {
  initializeSocketServer,
  TypedServer,
} from './sockets/connectionHandler';
import { startEscrowMonitorJob } from './jobs/escrowMonitor';
import { startEventPoller } from './services/eventPoller';
import {
  GracefulShutdownService,
  registerShutdownHandlers,
} from './services/gracefulShutdownService';

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
}

// Controller entry: OS signals → GracefulShutdownService → DB / sockets.
const shutdownService = new GracefulShutdownService({ httpServer, io });
registerShutdownHandlers(shutdownService);

export { httpServer, io, shutdownService };
