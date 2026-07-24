import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import authService from '../services/authService';
import { validateRegisterInput } from '../validators/authValidator';
import asyncHandler from '../utils/asyncHandler';
import type { ILoginPayload } from '../interfaces/IUser';

class AuthController {
  public login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const loginPayload: ILoginPayload = {
      email: req.body.email,
      password: req.body.password,
    };

    const result = await authService.login(loginPayload);

    res.status(StatusCodes.OK).json({
      status: 'success',
      message: 'Login successful',
      data: result,
    });
  });

  public register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const input = validateRegisterInput(req.body);
    const user = await authService.registerUser(input);

    res.status(StatusCodes.CREATED).json({
      status: 'success',
      message: 'User registered successfully',
      data: { user },
    });
  });
}

export default new AuthController();
