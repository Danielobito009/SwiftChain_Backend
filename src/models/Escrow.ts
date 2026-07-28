import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Lifecycle of funds held in a Soroban escrow contract for a delivery.
 */
export enum EscrowLockStatus {
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
}

/** The kind of on-chain operation a recorded transaction hash represents. */
export type EscrowTransactionType = 'fund' | 'release' | 'refund';

export interface IEscrowTransaction {
  hash: string;
  type: EscrowTransactionType;
  ledger?: number;
  recordedAt: Date;
}

export interface IEscrow extends Document {
  delivery: Types.ObjectId;
  contractId: string;
  amount: number;
  asset: string;
  lockStatus: EscrowLockStatus;
  fundedBy?: string;
  transactions: IEscrowTransaction[];
  lockedAt?: Date;
  releasedAt?: Date;
  refundedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EscrowTransactionSchema = new Schema<IEscrowTransaction>(
  {
    hash: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['fund', 'release', 'refund'],
      required: true,
    },
    ledger: { type: Number },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const EscrowSchema = new Schema<IEscrow>(
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
      required: true,
      index: true,
    },
    contractId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    asset: {
      type: String,
      required: true,
      trim: true,
    },
    lockStatus: {
      type: String,
      enum: Object.values(EscrowLockStatus),
      default: EscrowLockStatus.PENDING,
      index: true,
    },
    fundedBy: { type: String, trim: true },
    transactions: {
      type: [EscrowTransactionSchema],
      default: [],
    },
    lockedAt: { type: Date },
    releasedAt: { type: Date },
    refundedAt: { type: Date },
  },
  { timestamps: true },
);

// A given on-chain transaction hash must only ever be recorded once across
// all escrows, preventing duplicate ingestion by the indexer.
EscrowSchema.index({ 'transactions.hash': 1 }, { unique: true, sparse: true });

const Escrow = mongoose.model<IEscrow>('Escrow', EscrowSchema);

export default Escrow;
export { Escrow };
