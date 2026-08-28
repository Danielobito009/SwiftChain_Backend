import mongoose, { Schema, Document, Types, Model } from 'mongoose';

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

const Escrow: Model<IEscrow> =
  (mongoose.models.Escrow as Model<IEscrow>) || mongoose.model<IEscrow>('Escrow', EscrowSchema);

export default Escrow;
export { Escrow };
