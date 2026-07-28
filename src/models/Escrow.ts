import mongoose, { Schema, Document } from 'mongoose';

/**
 * Lifecycle states for an escrow lock.
 */
export enum EscrowStatus {
  LOCKED = 'locked',
  RELEASED = 'released',
  EXPIRED = 'expired',
  RESOLVED = 'resolved',
}

export interface IEscrow extends Document {
  deliveryId: string;
  contractId?: string;
  amount: number;
  lockedAt: Date;
  ttlSeconds: number;
  expiresAt: Date;
  status: EscrowStatus;
  flaggedAt?: Date;
  flaggedLedger?: number;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EscrowSchema = new Schema<IEscrow>(
  {
    deliveryId: { type: String, required: true, index: true },
    contractId: { type: String },
    amount: { type: Number, required: true, min: 0 },
    lockedAt: { type: Date, required: true },
    ttlSeconds: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: Object.values(EscrowStatus),
      default: EscrowStatus.LOCKED,
      index: true,
    },
    flaggedAt: { type: Date },
    flaggedLedger: { type: Number },
    resolvedAt: { type: Date },
    resolvedBy: { type: String },
    resolutionNotes: { type: String },
  },
  { timestamps: true },
);

// Speeds up the recurring scan for locks past their TTL.
EscrowSchema.index({ status: 1, expiresAt: 1 });

EscrowSchema.pre('validate', function (this: IEscrow, next) {
  if (!this.expiresAt && this.lockedAt && this.ttlSeconds) {
    this.expiresAt = new Date(this.lockedAt.getTime() + this.ttlSeconds * 1000);
  }
  next();
});

const Escrow = mongoose.model<IEscrow>('Escrow', EscrowSchema);

export default Escrow;
export { Escrow };
