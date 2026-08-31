import EventLog from '../models/EventLog';
import Delivery from '../models/Delivery';
import { sorobanRpcClient } from '../config/stellar';
import logger from '../config/logger';
import { webSocketService } from './webSocketService';
export interface IndexerStatusData {
  eventType: string;
  contractId: string;
  lastProcessedLedger: number;
  currentLedger: number;
  lag: number;
  updatedAt: Date;
}

export interface DeliveryStatusUpdatedEvent {
  contractId: string;
  deliveryId: string;
  newStatus: string;
}

export class IndexerService {
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
      logger.error(`[IndexerService] Error fetching indexer status: ${
        error instanceof Error ? eror.message : String(error)}`);
      throw error;
    }
  }

  public async processDeliveryStatusUpdated(event: DeliveryStatusUpdatedEvent): Promise<void> {
    try {
      const { contractId, deliveryId, newStatus } = event;
      const updatedDelivery = await Delivery.findOneAndUpdate({ _id: deliveryId, contractId }, { status: newStatus }, { new: true, runValidators: true }).lean();
      if (!updatedDelivery) {
        logger.warn(`[IndexerService] Delivery not found for id ${deliveryId} on contract ${contractId}`);
        return;
      }
      await webSocketService.notifyDeliveryStatusChange(updatedDelivery);
      logger.info(`[IndexerService] Delivery ${deliveryId} status updated to ${newStatus} on contract ${contractId}`);
    } catch (error) {
      logger.error(`[IndexerSerice] Error processing delivery_status_updated event: ${
        error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

export const indexerService = new IndexerService();