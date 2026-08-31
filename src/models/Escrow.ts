import mongoose, { Document, Schema } from 'mongoose';

export interface IEscrow extends Document {
  amount: number;
  buyer?: mongoose.Types.ObjectId;
  driver?: mongoose.Types.ObjectId;
  status: 'pending' | 'assigned' | 'locked' | 'picked_up' | 'in_transit' | 'delivered' | 'refunded' | 'released' | 'completed';
  locked: boolean;
  sorobanTxId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const EscrowSchema: Schema = new Schema(
  {
    amount: { type: Number, required: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User' },
    driver: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, default: 'pending' },
    locked: { type: Boolean, default: false },
    sorobanTxId: { type: String, default: null },
  },
  { timestamps: true },
);

export default mongoose.model<IEscrow>('Escrow', EscrowSchema);
