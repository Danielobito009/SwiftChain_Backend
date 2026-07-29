import mongoose, { Schema } from 'mongoose';
import { IDriverProfile, ReputationTier } from '../interfaces/IDriverProfile';

const vehicleDetailsSchema = new Schema(
  {
    make: {
      type: String,
      required: [true, 'Vehicle make is required'],
      trim: true,
    },
    model: {
      type: String,
      required: [true, 'Vehicle model is required'],
      trim: true,
    },
    year: {
      type: Number,
      min: [1980, 'Vehicle year must be 1980 or later'],
      max: [new Date().getFullYear() + 1, 'Vehicle year cannot be in the future'],
    },
    plateNumber: {
      type: String,
      required: [true, 'Vehicle plate number is required'],
      trim: true,
      uppercase: true,
    },
    capacityKg: {
      type: Number,
      min: [0, 'capacityKg cannot be negative'],
    },
  },
  { _id: false },
);

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
    vehicleDetails: {
      type: vehicleDetailsSchema,
      required: false,
    },
  },
  { timestamps: true },
);

// Index for leaderboard queries: descending reputation points
driverProfileSchema.index({ reputationPoints: -1 });

const DriverProfile = mongoose.model<IDriverProfile>('DriverProfile', driverProfileSchema);

export default DriverProfile;
