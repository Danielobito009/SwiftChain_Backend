import dotenv from 'dotenv';
import app from './app';
import logger from './config/logger';
import { startEscrowMonitorJob, stopEscrowMonitorJob } from './jobs/escrowMonitor';

dotenv.config();

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  logger.info(`📝 Health check: http://localhost:${PORT}/health`);
  logger.info(`📦 ETA endpoint: http://localhost:${PORT}/api/v1/deliveries/:id/eta`);
});

if (process.env.NODE_ENV !== 'test') {
  startEscrowMonitorJob();
}

const gracefulShutdown = (): void => {
  logger.info('Shutting down gracefully...');
  stopEscrowMonitorJob();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
