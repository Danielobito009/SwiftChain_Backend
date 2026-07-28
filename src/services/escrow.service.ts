import { Types } from 'mongoose';
import httpStatus from 'http-status-codes';
import Escrow, { IEscrow, EscrowLockStatus } from '../models/Escrow';
import Delivery, { DeliveryStatus } from '../models/Delivery';
import { AppError } from '../utils/AppError';
import logger from '../config/logger';

/** Data extracted from an on-chain `escrow_funded` contract event. */
export interface EscrowFundedInput {
  contractId: string;
  deliveryId: string;
  amount: number;
  asset: string;
  fundedBy?: string;
  transactionHash: string;
  ledger?: number;
}

export class EscrowService {
  /**
   * Record an `escrow_funded` event: create or update the Escrow document
   * for the contract and mark the related Delivery as funded.
   *
   * Idempotent — replaying the same transaction hash for an already
   * recorded escrow is a no-op so the indexer can safely re-process a
   * ledger range without producing duplicate side effects.
   */
  async recordEscrowFunded(input: EscrowFundedInput): Promise<IEscrow> {
    if (!Types.ObjectId.isValid(input.deliveryId)) {
      throw new AppError('Invalid deliveryId', httpStatus.BAD_REQUEST);
    }

    const delivery = await Delivery.findById(input.deliveryId);
    if (!delivery) {
      throw new AppError('Delivery not found for escrow_funded event', httpStatus.NOT_FOUND);
    }

    let escrow = await Escrow.findOne({ contractId: input.contractId });

    if (escrow?.transactions.some((tx) => tx.hash === input.transactionHash)) {
      logger.info(
        `[EscrowService] Skipping already-processed escrow_funded tx=${input.transactionHash}`,
      );
      return escrow;
    }

    const transaction = {
      hash: input.transactionHash,
      type: 'fund' as const,
      ledger: input.ledger,
      recordedAt: new Date(),
    };

    if (escrow) {
      escrow.amount = input.amount;
      escrow.asset = input.asset;
      escrow.fundedBy = input.fundedBy;
      escrow.lockStatus = EscrowLockStatus.LOCKED;
      escrow.lockedAt = escrow.lockedAt ?? new Date();
      escrow.transactions.push(transaction);
      await escrow.save();
    } else {
      escrow = await Escrow.create({
        delivery: delivery._id,
        contractId: input.contractId,
        amount: input.amount,
        asset: input.asset,
        fundedBy: input.fundedBy,
        lockStatus: EscrowLockStatus.LOCKED,
        lockedAt: new Date(),
        transactions: [transaction],
      });
    }

    if (delivery.status !== DeliveryStatus.FUNDED) {
      delivery.status = DeliveryStatus.FUNDED;
      await delivery.save();
    }

    logger.info(
      `[EscrowService] escrow_funded recorded — contract=${input.contractId} ` +
        `delivery=${input.deliveryId} tx=${input.transactionHash}`,
    );

    return escrow;
  }

  async getByDeliveryId(deliveryId: string): Promise<IEscrow> {
    if (!Types.ObjectId.isValid(deliveryId)) {
      throw new AppError('Invalid deliveryId', httpStatus.BAD_REQUEST);
    }

    const escrow = await Escrow.findOne({ delivery: deliveryId });
    if (!escrow) {
      throw new AppError('Escrow not found for delivery', httpStatus.NOT_FOUND);
    }

    return escrow;
  }

  async getByContractId(contractId: string): Promise<IEscrow> {
    const escrow = await Escrow.findOne({ contractId });
    if (!escrow) {
      throw new AppError('Escrow not found for contract', httpStatus.NOT_FOUND);
    }

    return escrow;
  }
}

export const escrowService = new EscrowService();
