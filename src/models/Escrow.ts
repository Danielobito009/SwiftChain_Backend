import { Document, Model, Schema, Types, model } from 'mongoose';

/** Lifecycle states of an escrow contract. */
export const ESCROW_STATUSES = ['pending', 'funded', 'released', 'refunded', 'disputed'] as const;
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

export interface IEscrow {
  delivery: Types.ObjectId;
  payer: Types.ObjectId;
  payee: Types.ObjectId;
  amount: number;
  currency: string;
  status: EscrowStatus;
  /** Soroban contract address holding the funds, once deployed. */
  contractAddress?: string;
  /** Stellar transaction hash of the most recent settlement. */
  transactionHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type IEscrowDocument = IEscrow & Document;

const escrowSchema = new Schema<IEscrowDocument>(
  {
    delivery: {
      type: Schema.Types.ObjectId,
      ref: 'Delivery',
      required: [true, 'Delivery reference is required'],
      unique: true,
      index: true,
    },
    payer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Payer is required'],
      index: true,
    },
    payee: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Payee is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Escrow amount is required'],
      min: [0, 'Escrow amount cannot be negative'],
    },
    currency: {
      type: String,
      default: 'XLM',
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: ESCROW_STATUSES,
      default: 'pending',
      index: true,
    },
    contractAddress: { type: String, trim: true },
    transactionHash: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>): Record<string, unknown> => {
        ret.id = ret._id?.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

escrowSchema.index({ status: 1, createdAt: -1 });

export const Escrow: Model<IEscrowDocument> = model<IEscrowDocument>('Escrow', escrowSchema);

export default Escrow;
