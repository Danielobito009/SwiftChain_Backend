import mongoose, { Schema } from 'mongoose';
import { IDriverProfile, ReputationTier } from '../interfaces/IDriverProfile';

const driverProfileSchema = new Schema<IDriverProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      unique: true,
    },
    reputationPoints: {
      type: Number,
      default: 0,
      min: [0, 'reputationPoints cannot be negative'],
    },
    tier: {
      type: String,
      enum: Object.values(ReputationTier),
      default: ReputationTier.BRONZE,
    },
    totalDeliveries: {
      type: Number,
      default: 0,
      min: 0,
    },
    completedDeliveries: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

// Index for leaderboard queries: descending reputation points
driverProfileSchema.index({ reputationPoints: -1 });

const DriverProfile = mongoose.model<IDriverProfile>('DriverProfile', driverProfileSchema);

export default DriverProfile;
