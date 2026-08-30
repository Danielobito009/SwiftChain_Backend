import { Types } from 'mongoose';
import httpStatus from 'http-status-codes';
import Escrow, { IEscrow, EscrowLockStatus } from '../models/Escrow';
import Delivery, { DeliveryStatus } from '../models/Delivery';
import { AppError } from '../utils/AppError';
import logger from '../config/logger';
import { withLock } from '../config/redis';

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

/** Input data for releasing an escrow. */
export interface ReleaseEscrowInput {
  /** MongoDB ObjectId or contractId of the escrow to release. */
  escrowId: string;
  /** Transaction hash of the on-chain release operation. */
  transactionHash: string;
  /** Optional ledger sequence for audit trail. */
  ledger?: number;
  /** User or system identifier initiating the release. */
  releasedBy?: string;
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

  /**
   * Release an escrow using distributed locking to prevent race conditions.
   *
   * This method acquires a Redis lock before processing the release to ensure
   * that concurrent requests cannot release the same escrow twice. The lock is
   * held for the duration of the transaction and automatically released afterward.
   *
   * @param input - Release escrow input data
   * @returns The updated escrow document
   * @throws AppError if the escrow is not found, not in LOCKED status, or lock acquisition fails
   *
   * @example
   * const escrow = await escrowService.releaseEscrow({
   *   escrowId: '507f1f77bcf86cd799439011',
   *   transactionHash: '0xabc123...',
   *   ledger: 12345,
   *   releasedBy: 'user_id_or_system'
   * });
   */
  async releaseEscrow(input: ReleaseEscrowInput): Promise<IEscrow> {
    const { escrowId, transactionHash, ledger, releasedBy } = input;

    // Validate escrowId format
    if (!Types.ObjectId.isValid(escrowId) && !escrowId.startsWith('C')) {
      throw new AppError('Invalid escrowId format', httpStatus.BAD_REQUEST);
    }

    // Define the lock resource key
    const lockResource = `escrow:release:${escrowId}`;

    logger.info(
      `[EscrowService] Attempting to release escrow — id=${escrowId} tx=${transactionHash}`,
    );

    // Execute release within a distributed lock
    return await withLock(lockResource, async () => {
      logger.debug(`[EscrowService] Lock acquired for escrow release — id=${escrowId}`);

      // Fetch the escrow (by ObjectId or contractId)
      let escrow: IEscrow | null = null;

      if (Types.ObjectId.isValid(escrowId)) {
        escrow = await Escrow.findById(escrowId);
      } else {
        escrow = await Escrow.findOne({ contractId: escrowId });
      }

      if (!escrow) {
        throw new AppError('Escrow not found', httpStatus.NOT_FOUND);
      }

      // Check if the escrow is already released
      if (escrow.lockStatus === EscrowLockStatus.RELEASED) {
        logger.warn(
          `[EscrowService] Escrow already released — id=${escrowId} status=${escrow.lockStatus}`,
        );
        throw new AppError('Escrow has already been released', httpStatus.CONFLICT);
      }

      // Check if the escrow is in a valid state to be released
      if (escrow.lockStatus !== EscrowLockStatus.LOCKED) {
        throw new AppError(
          `Escrow cannot be released from status: ${escrow.lockStatus}`,
          httpStatus.CONFLICT,
        );
      }

      // Check if this transaction has already been recorded (idempotency)
      if (escrow.transactions.some((tx) => tx.hash === transactionHash)) {
        logger.info(
          `[EscrowService] Skipping already-processed release tx=${transactionHash} for escrow=${escrowId}`,
        );
        return escrow;
      }

      // Record the release transaction
      const releaseTransaction = {
        hash: transactionHash,
        type: 'release' as const,
        ledger,
        recordedAt: new Date(),
      };

      escrow.lockStatus = EscrowLockStatus.RELEASED;
      escrow.releasedAt = new Date();
      escrow.transactions.push(releaseTransaction);

      await escrow.save();

      // Update related delivery status to COMPLETED
      const delivery = await Delivery.findById(escrow.delivery);
      if (delivery && delivery.status !== DeliveryStatus.COMPLETED) {
        delivery.status = DeliveryStatus.COMPLETED;
        await delivery.save();
        logger.debug(
          `[EscrowService] Delivery status updated to COMPLETED — delivery=${String(escrow.delivery)}`,
        );
      }

      logger.info(
        `[EscrowService] Escrow released successfully — id=${escrowId} ` +
          `contract=${escrow.contractId} tx=${transactionHash} releasedBy=${releasedBy ?? 'system'}`,
      );

      return escrow;
    });
  }
}

export const escrowService = new EscrowService();
