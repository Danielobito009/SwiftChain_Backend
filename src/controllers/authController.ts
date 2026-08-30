import { StatusCodes } from 'http-status-codes';
import { loginUser, registerUser } from '../services/authService';
import { validateLoginInput, validateRegisterInput } from '../validators/authValidator';
import asyncHandler from '../utils/asyncHandler';

/**
 * POST /api/v1/auth/register
 *
 * Registers a new user and returns an access token. Protected by the
 * registration rate limiter.
 */
export const register = asyncHandler(async (req, res) => {
  const input = validateRegisterInput(req.body);
  const result = await registerUser(input);

  res.status(StatusCodes.CREATED).json({
    status: 'success',
    message: 'User registered successfully',
    data: result,
  });
});

/**
 * POST /api/v1/auth/login
 *
 * Authenticates a set of credentials. Protected by the strict auth rate
 * limiter, which throttles failed attempts per IP and per targeted account.
 */
export const login = asyncHandler(async (req, res) => {
  const input = validateLoginInput(req.body);
  const result = await loginUser(input);

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'Logged in successfully',
    data: result,
  });
});

export default { register, login };
