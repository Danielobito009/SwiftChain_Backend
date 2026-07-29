import { Router } from 'express';
import userController from '../controllers/userController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { validateRequest } from '../middlewares/validateRequest';
import { updateWalletSchema } from '../validators/userValidator';

const router = Router();

/**
 * @route   PUT /api/v1/users/wallet
 * @desc    Link or update the authenticated user's Stellar wallet address
 * @access  Private
 */
router.put(
  '/wallet',
  authMiddleware,
  validateRequest({ body: updateWalletSchema }),
  userController.updateWallet,
);

export default router;
