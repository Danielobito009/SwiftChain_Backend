import { StatusCodes } from 'http-status-codes';
import DriverProfile from '../models/DriverProfile';
import { IDriverProfile, IVehicleDetails } from '../interfaces/IDriverProfile';
import AppError from '../utils/AppError';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  reputationPoints: number;
  tier: string;
  totalDeliveries: number;
  completedDeliveries: number;
}

export interface LeaderboardResult {
  data: LeaderboardEntry[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class DriverService {
  async getLeaderboard(page: number, limit: number): Promise<LeaderboardResult> {
    const skip = (page - 1) * limit;

    const [profiles, total] = await Promise.all([
      DriverProfile.find()
        .sort({ reputationPoints: -1 })
        .skip(skip)
        .limit(limit)
        .lean<IDriverProfile[]>(),
      DriverProfile.countDocuments(),
    ]);

    const data: LeaderboardEntry[] = profiles.map((profile, index) => ({
      rank: skip + index + 1,
      userId: String(profile.userId),
      reputationPoints: profile.reputationPoints,
      tier: profile.tier,
      totalDeliveries: profile.totalDeliveries,
      completedDeliveries: profile.completedDeliveries,
    }));

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Creates or updates the vehicle details on a driver's profile.
   *
   * If the driver has no DriverProfile document yet (e.g. reputation events
   * haven't fired for them), one is created with default reputation stats
   * alongside the supplied vehicle details.
   */
  async setVehicleDetails(
    userId: string,
    vehicleDetails: IVehicleDetails,
  ): Promise<IDriverProfile> {
    if (!vehicleDetails.make || !vehicleDetails.make.trim()) {
      throw new AppError('Vehicle make is required.', StatusCodes.BAD_REQUEST);
    }
    if (!vehicleDetails.model || !vehicleDetails.model.trim()) {
      throw new AppError('Vehicle model is required.', StatusCodes.BAD_REQUEST);
    }
    if (!vehicleDetails.plateNumber || !vehicleDetails.plateNumber.trim()) {
      throw new AppError('Vehicle plate number is required.', StatusCodes.BAD_REQUEST);
    }

    const profile = await DriverProfile.findOneAndUpdate(
      { userId },
      { $set: { vehicleDetails } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
    );

    return profile;
  }
}

export const driverService = new DriverService();
