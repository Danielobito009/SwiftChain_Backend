import { xdr, scValToNative } from '@stellar/stellar-sdk';
import { deliveryService } from '../services/delivery.service';
import logger from '../config/logger';
export class DeliveryHandlers {
public async processDeliveryCreatedEvent(xdrPayload: string) {
try {
const nativeData: any = scValToNative(xdr.ScVal.fromXDR(xdrPayload, 'base64'));
const deliveryId = nativeData?.delivery_id;
const contractId = nativeData?.contract_id;
if (!deliveryId || !contractId) throw new Error('Missing delivery_id or contract_id');
return await deliveryService.updateDeliveryOnChainCreation(deliveryId, contractId);
} catch (error: any) { logger.error(`Error processing delivery_created event: ${error.message}`); throw error; }
}
public async processDeliveryStatusUpdatedEvent(xdrPayload: string): Promise<unknown> {
try {
const nativeData: any = scValToNative(xdr.ScVal.fromXDR(xdrPayload, 'base64'));
const deliveryId = nativeData?.delivery_id;
const status = nativeData?.status;
if (!deliveryId || !status) throw new Error('Missing delivery_id or status');
const normalizedStatus = typeof status === 'string' ? status : String(status);
return await deliveryService.updateDeliveryStatus(deliveryId, normalizedStatus);
} catch (error: any) { logger.error(`Error processing delivery_status_updated event: ${error.message}`); throw error; }
}
}
export const deliveryHandlers = new DeliveryHandlers();
