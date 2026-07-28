import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import Escrow, { IEscrow } from '../models/Escrow';
import Delivery, { IDelivery } from '../models/Delivery';
import AppError from '../utils/AppError';
import logger from '../config/logger';

/**
 * Minimal delivery projection embedded in the escrow status response so the
 * frontend can render the escrow panel without a second round-trip.
 */
export interface EscrowDeliverySummary {
  id: string;
  deliveryId?: string;
  trackingNumber?: string;
  status?: string;
  escrowAmount?: number;
  isArchived: boolean;
}

/** Shape returned by {@link EscrowService.getEscrowByDeliveryId}. */
export interface EscrowStatusResult {
  escrow: IEscrow;
  delivery: EscrowDeliverySummary;
}

export class EscrowService {
  /**
   * Resolve a delivery from the database by either its MongoDB `_id` or its
   * business `deliveryId` key, so the endpoint works with whichever identifier
   * the caller holds.
   *
   * @param id - Delivery `_id` or `deliveryId`.
   * @throws  {AppError} 400 when the identifier is blank.
   * @throws  {AppError} 404 when no delivery matches.
   */
  private async resolveDelivery(id: string): Promise<IDelivery> {
    const identifier = id?.trim();

    if (!identifier) {
      throw new AppError('Delivery identifier is required', StatusCodes.BAD_REQUEST);
    }

    const delivery = Types.ObjectId.isValid(identifier)
      ? await Delivery.findById(identifier).exec()
      : await Delivery.findOne({ deliveryId: identifier }).exec();

    if (!delivery) {
      throw new AppError(`Delivery '${identifier}' not found`, StatusCodes.NOT_FOUND);
    }

    return delivery;
  }

  /**
   * Fetch the escrow record associated with a delivery.
   *
   * The response is read straight from the `escrows` collection — the on-chain
   * state is mirrored into that collection by the Soroban event indexer, so no
   * RPC call is needed on the read path.
   *
   * @param id - Delivery `_id` or `deliveryId`.
   * @returns    The escrow document plus a summary of its delivery.
   * @throws     {AppError} 404 when the delivery or its escrow does not exist.
   */
  public async getEscrowByDeliveryId(id: string): Promise<EscrowStatusResult> {
    const delivery = await this.resolveDelivery(id);

    const escrow = await Escrow.findOne({ delivery: delivery._id }).exec();

    if (!escrow) {
      throw new AppError(
        `No escrow record exists for delivery '${String(delivery._id)}'`,
        StatusCodes.NOT_FOUND,
      );
    }

    logger.debug(
      `[EscrowService] Escrow resolved — delivery=${String(delivery._id)} ` +
        `escrow=${String(escrow._id)} status=${escrow.status}`,
    );

    return {
      escrow,
      delivery: {
        id: String(delivery._id),
        deliveryId: delivery.deliveryId,
        trackingNumber: delivery.trackingNumber,
        status: delivery.status,
        escrowAmount: delivery.escrowAmount,
        isArchived: Boolean(delivery.isDeleted),
      },
    };
  }
}

/** Singleton instance used by the controller layer. */
export const escrowService = new EscrowService();
