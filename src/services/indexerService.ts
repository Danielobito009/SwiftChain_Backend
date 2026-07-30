import EventLog from '../models/EventLog';
import { sorobanRpcClient } from '../config/stellar';
import logger from '../config/logger';

export interface IndexerStatusData {
  eventType: string;
  contractId: string;
  lastProcessedLedger: number;
  currentLedger: number;
  lag: number;
  updatedAt: Date;
}

export class IndexerService {
  /**
   * Retrieves the current catch-up status for all registered event types.
   * Compares the last processed ledger with the current network ledger.
   */
  public async getIndexerStatus(): Promise<IndexerStatusData[]> {
    try {
      const currentLedgerResponse = await sorobanRpcClient.getLatestLedger();
      const currentLedger = currentLedgerResponse.sequence;

      const logs = await EventLog.find({}).lean();

      return logs.map((log) => {
        const lag = Math.max(0, currentLedger - log.lastProcessedLedger);
        return {
          eventType: log.eventType,
          contractId: log.contractId,
          lastProcessedLedger: log.lastProcessedLedger,
          currentLedger,
          lag,
          updatedAt: log.updatedAt,
        };
      });
    } catch (error) {
      logger.error(
        `[IndexerService] Error fetching indexer status: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }
}

export const indexerService = new IndexerService();
