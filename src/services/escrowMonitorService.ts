import logger from '../config/logger';
import { startEscrowMonitorJob, stopEscrowMonitorJob } from '../jobs/escrowMonitor';

export { startEscrowMonitorJob, stopEscrowMonitorJob };

export const startEscrowMonitorService = (): void => {
  logger.info('Escrow monitor service started');
  startEscrowMonitorJob();
};

export const stopEscrowMonitorService = (): void => {
  logger.info('Escrow monitor service stopped');
  stopEscrowMonitorJob();
};

export default {
  startEscrowMonitorJob,
  stopEscrowMonitorJob,
  startEscrowMonitorService,
  stopEscrowMonitorService,
};
