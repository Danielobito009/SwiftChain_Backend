import { Router } from 'express';
import { login, register } from '../controllers/authController';
import { authLimiter, registrationLimiter } from '../middlewares/rateLimiter';

const router = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public (rate limited per IP)
 */
router.post('/register', registrationLimiter, register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate a user and issue an access token
 * @access  Public (strictly rate limited per IP and per targeted account)
 */
router.post('/login', authLimiter, login);

export default router;
