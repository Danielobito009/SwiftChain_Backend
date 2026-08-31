import mongoose, { Document, Schema } from 'mongoose';

export interface IDisputeHistoryEntry {
  actor: mongoose.Types.ObjectId | null;
  action: string;
  notes?: string;
  timestamp: Date;
}

export interface IDispute extends Document {
  escrow: mongoose.Types.ObjectId;
  reason: string;
  status: 'open' | 'locked' | 'resolved' | 'closed';
  createdBy?: mongoose.Types.ObjectId;
  lockedAt?: Date | null;
  resolvedAt?: Date | null;
  resolution?: 'refund' | 'release' | null;
  history: IDisputeHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const DisputeHistorySchema: Schema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    notes: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const DisputeSchema: Schema = new Schema(
  {
    escrow: { type: Schema.Types.ObjectId, ref: 'Escrow', required: true },
    reason: { type: String, required: true },
    status: { type: String, default: 'open' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lockedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolution: { type: String, enum: ['refund', 'release'], default: null },
    history: { type: [DisputeHistorySchema], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model<IDispute>('Dispute', DisputeSchema);
