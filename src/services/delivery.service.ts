import { Delivery } from '../models/Delivery';
import logger from '../config/logger';

export class DeliveryService {
  /**
   * Updates a delivery with its corresponding smart contract ID
   * @param deliveryId The ID of the delivery off-chain
   * @param contractId The ID of the Soroban smart contract created for this delivery
   * @returns The updated Delivery document
   */
  public async updateDeliveryOnChainCreation(deliveryId: string, contractId: string) {
    logger.info(`Updating delivery ${deliveryId} with contract ID ${contractId}`);
    
    const delivery = await Delivery.findOneAndUpdate(
      { deliveryId },
      { 
        contractId,
        status: 'Assigned' // Assuming it gets assigned after contract creation, or remains Pending. We'll set it to Assigned for now as a state change.
      },
      { new: true }
    );

    if (!delivery) {
      logger.error(`Delivery not found for deliveryId: ${deliveryId}`);
      throw new Error(`Delivery not found for deliveryId: ${deliveryId}`);
    }

    return delivery;
  }
}

export const deliveryService = new DeliveryService();
