import DriverProfile from '../models/DriverProfile';
import { IDriverProfile } from '../interfaces/IDriverProfile';

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
}

export const driverService = new DriverService();
