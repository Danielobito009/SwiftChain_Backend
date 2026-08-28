import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { profilePictureService } from '../services/profilePicture.service';
import type { IUser } from '../interfaces/IUser';
import AppError from '../utils/AppError';
import logger from '../config/logger';

/**
 * ProfileController handles HTTP requests for user profile management,
 * including profile picture uploads.
 *
 * All routes are protected by authentication middleware and operate on
 * the authenticated user's profile.
 */

// ─── POST /api/v1/profile/picture ──────────────────────────────────────────────

/**
 * Upload or update the authenticated user's profile picture.
 *
 * Accepts a single image file via multipart/form-data with field name "profilePicture".
 * The image is automatically resized, compressed, and uploaded to storage.
 *
 * Request:
 *   - multipart/form-data with "profilePicture" file
 *
 * Response:
 *   200 OK — profile picture uploaded successfully
 *   {
 *     status: "success",
 *     message: "Profile picture uploaded successfully",
 *     data: {
 *       profilePicture: "https://...",
 *       profilePictureKey: "profiles/userId/...",
 *       uploadedAt: "2024-01-15T10:30:00.000Z"
 *     }
 *   }
 *
 * Errors:
 *   400 — no file provided, invalid file type, or file too large
 *   401 — not authenticated
 *   500 — image processing or storage failure
 */
export const uploadProfilePicture = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Extract authenticated user
    const currentUser = (req as Request & { user?: IUser }).user;
    if (!currentUser) {
      throw new AppError('Authentication required', StatusCodes.UNAUTHORIZED);
    }

    // Extract uploaded file from multer middleware
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      throw new AppError(
        'Profile picture file is required. Use field name "profilePicture"',
        StatusCodes.BAD_REQUEST,
      );
    }

    logger.info(
      `[ProfileController] Upload request — userId=${currentUser._id} ` +
        `fileName="${file.originalname}" size=${file.size} bytes`,
    );

    // Validate that the file is actually an image
    const isValid = await profilePictureService.isValidImage(file.buffer);
    if (!isValid) {
      throw new AppError(
        'Invalid image file. Please upload a valid JPEG, PNG, or WebP image',
        StatusCodes.BAD_REQUEST,
      );
    }

    // Process and upload the profile picture
    const result = await profilePictureService.uploadProfilePicture({
      userId: currentUser._id.toString(),
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      sizeBytes: file.size,
    });

    res.status(StatusCodes.OK).json({
      status: 'success',
      message: 'Profile picture uploaded successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/v1/profile/picture ────────────────────────────────────────────

/**
 * Remove the authenticated user's profile picture.
 *
 * Response:
 *   200 OK — profile picture removed
 *   {
 *     status: "success",
 *     message: "Profile picture removed successfully"
 *   }
 *
 * Errors:
 *   401 — not authenticated
 *   404 — user has no profile picture to remove
 */
export const deleteProfilePicture = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const currentUser = (req as Request & { user?: IUser }).user;
    if (!currentUser) {
      throw new AppError('Authentication required', StatusCodes.UNAUTHORIZED);
    }

    logger.info(`[ProfileController] Delete request — userId=${currentUser._id}`);

    const deleted = await profilePictureService.deleteProfilePicture(
      currentUser._id.toString(),
    );

    if (!deleted) {
      throw new AppError('No profile picture to remove', StatusCodes.NOT_FOUND);
    }

    res.status(StatusCodes.OK).json({
      status: 'success',
      message: 'Profile picture removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/v1/profile ───────────────────────────────────────────────────────

/**
 * Get the authenticated user's profile information.
 *
 * Response:
 *   200 OK — user profile data
 *   {
 *     status: "success",
 *     data: {
 *       user: {
 *         id: "...",
 *         email: "...",
 *         firstName: "...",
 *         lastName: "...",
 *         role: "...",
 *         profilePicture: "https://...",
 *         createdAt: "...",
 *         updatedAt: "..."
 *       }
 *     }
 *   }
 */
export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const currentUser = (req as Request & { user?: IUser }).user;
    if (!currentUser) {
      throw new AppError('Authentication required', StatusCodes.UNAUTHORIZED);
    }

    // Return user profile (password is excluded by User model toJSON transform)
    res.status(StatusCodes.OK).json({
      status: 'success',
      data: {
        user: currentUser.toJSON(),
      },
    });
  } catch (error) {
    next(error);
  }
};
