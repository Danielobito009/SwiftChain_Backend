import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import User from '../models/User';
import AppError from '../utils/AppError';
import asyncHandler from '../utils/asyncHandler';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware';

class UserController {
  /**
   * PUT /api/v1/users/wallet
   *
   * Links or updates the authenticated user's Stellar wallet address.
   */
  public updateWallet = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      const { user } = req as AuthenticatedRequest;
      const userId = user?.userId || user?.id;

      if (!userId) {
        throw new AppError('Authentication required.', StatusCodes.UNAUTHORIZED);
      }

      const { walletAddress } = req.body as { walletAddress: string };

      const existing = await User.findOne({ walletAddress, _id: { $ne: userId } });
      if (existing) {
        throw new AppError(
          'This wallet address is already linked to another account.',
          StatusCodes.CONFLICT,
        );
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { walletAddress },
        { new: true, runValidators: true },
      );

      if (!updatedUser) {
        throw new AppError('User not found.', StatusCodes.NOT_FOUND);
      }

      res.status(StatusCodes.OK).json({
        status: 'success',
        message: 'Wallet address updated successfully',
        data: { user: updatedUser },
      });
    },
  );
}

export default new UserController();
