import mongoose, { Document, Model, Schema, Types } from 'mongoose';

/**
 * Lifecycle of an on-chain escrow attached to a delivery.
 *
 *  - `pending`  : the escrow record exists off-chain but no funds are locked yet
 *                 (e.g. the unsigned XDR has been handed to the client wallet).
 *  - `locked`   : funds are held by the Soroban escrow contract.
 *  - `released` : funds were paid out to the driver after successful delivery.
 *  - `refunded` : funds were returned to the payer (cancelled delivery).
 *  - `disputed` : a dispute was raised; funds stay locked until resolution.
 */
export enum EscrowStatus {
  PENDING = 'pending',
  LOCKED = 'locked',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
}

/** Escrow states in which funds are actually held by the contract. */
const FUNDS_HELD_STATUSES: ReadonlySet<EscrowStatus> = new Set([
  EscrowStatus.LOCKED,
  EscrowStatus.DISPUTED,
]);

/** Escrow states that can no longer change. */
const TERMINAL_STATUSES: ReadonlySet<EscrowStatus> = new Set([
  EscrowStatus.RELEASED,
  EscrowStatus.REFUNDED,
]);

export interface IEscrow extends Document {
  /** Reference to the delivery this escrow secures. */
  delivery: Types.ObjectId;
  /** Current escrow lifecycle state. */
  status: EscrowStatus;
  /** Escrowed amount, denominated in `assetCode` units (not stroops). */
  amount: number;
  /** Asset code of the escrowed funds (e.g. `XLM`, `USDC`). */
  assetCode: string;
  /** Issuer account for non-native assets. */
  assetIssuer?: string;
  /** Soroban contract id (`C...`) holding the funds. */
  contractId?: string;
  /** Stellar account funding the escrow. */
  payerAddress?: string;
  /** Stellar account entitled to the funds on release. */
  payeeAddress?: string;
  /** Transaction hash of the successful lock invocation. */
  lockTransactionHash?: string;
  /** Transaction hash of the successful release invocation. */
  releaseTransactionHash?: string;
  /** Transaction hash of the successful refund invocation. */
  refundTransactionHash?: string;
  lockedAt?: Date;
  releasedAt?: Date;
  refundedAt?: Date;
  /** Ledger sequence of the last on-chain event applied to this record. */
  lastSyncedLedger?: number;
  /** Reason recorded when the escrow moved to `disputed`. */
  disputeReason?: string;
  createdAt: Date;
  updatedAt: Date;
  /** True while the contract is holding the funds. */
  readonly isFundsLocked: boolean;
  /** True once the escrow reached a state that can no longer change. */
  readonly isSettled: boolean;
}

const escrowSchema = new Schema<IEscrow>(
  {
    delivery: {
      type: Schema.Types.ObjectId,
      ref: 'Delivery',
      required: [true, 'delivery is required'],
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(EscrowStatus),
      default: EscrowStatus.PENDING,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'amount is required'],
      min: [0, 'amount cannot be negative'],
    },
    assetCode: {
      type: String,
      required: [true, 'assetCode is required'],
      trim: true,
      uppercase: true,
      maxlength: [12, 'assetCode cannot exceed 12 characters'],
    },
    assetIssuer: { type: String, trim: true },
    contractId: { type: String, trim: true },
    payerAddress: { type: String, trim: true },
    payeeAddress: { type: String, trim: true },
    lockTransactionHash: { type: String, trim: true },
    releaseTransactionHash: { type: String, trim: true },
    refundTransactionHash: { type: String, trim: true },
    lockedAt: { type: Date },
    releasedAt: { type: Date },
    refundedAt: { type: Date },
    lastSyncedLedger: { type: Number, min: 0 },
    disputeReason: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>): Record<string, unknown> {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

escrowSchema.virtual('isFundsLocked').get(function (this: IEscrow): boolean {
  return FUNDS_HELD_STATUSES.has(this.status);
});

escrowSchema.virtual('isSettled').get(function (this: IEscrow): boolean {
  return TERMINAL_STATUSES.has(this.status);
});

const Escrow: Model<IEscrow> =
  (mongoose.models.Escrow as Model<IEscrow>) || mongoose.model<IEscrow>('Escrow', escrowSchema);

export default Escrow;
export { Escrow };
