import mongoose, { Schema } from 'mongoose';
import { IFleet } from '../interfaces/IFleet';

const fleetSchema = new Schema<IFleet>(
  {
    name: {
      type: String,
      required: [true, 'Fleet name is required'],
      trim: true,
      minlength: [2, 'Fleet name must be at least 2 characters'],
      maxlength: [100, 'Fleet name cannot exceed 100 characters'],
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'ownerId is required'],
    },
    drivers: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
  },
  { timestamps: true },
);

fleetSchema.index({ ownerId: 1 });

const Fleet = mongoose.model<IFleet>('Fleet', fleetSchema);

export default Fleet;
