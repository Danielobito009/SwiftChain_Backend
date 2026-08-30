import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import logger from '../config/logger';
import ApiError from '../utils/ApiError';

interface AppError extends Error {
  statusCode?: number;
  code?: number;
}

interface NormalizedError {
  statusCode: number;
  message: string;
}

/**
 * Maps a thrown error onto the status code and message sent to the client.
 *
 * Only errors we recognise produce a descriptive message; anything else is
 * reported as a generic 500 so that internal details such as driver errors
 * or stack contents never reach the caller.
 */
const normalizeError = (err: AppError): NormalizedError => {
  if (err instanceof ApiError) {
    return { statusCode: err.statusCode, message: err.message };
  }

  // Schema validation failures map to 400 with every field error listed.
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors)
      .map((detail) => detail.message)
      .join('; ');
    return { statusCode: StatusCodes.BAD_REQUEST, message: details };
  }

  // A malformed ObjectId reaching the driver is a client mistake, not a bug.
  if (err instanceof mongoose.Error.CastError) {
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      message: `Invalid value supplied for \`${err.path}\``,
    };
  }

  // Unique index violation.
  if (err.code === 11000) {
    return {
      statusCode: StatusCodes.CONFLICT,
      message: 'A record with these details already exists',
    };
  }

  // A body-parser failure on malformed JSON.
  if (err instanceof SyntaxError && 'body' in err) {
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      message: 'Request body contains malformed JSON',
    };
  }

  if (err.statusCode && err.statusCode < 500) {
    return { statusCode: err.statusCode, message: err.message };
  }

  return {
    statusCode: err.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR,
    message: 'Internal Server Error',
  };
};

const errorHandler = (err: AppError, req: Request, res: Response, _next: NextFunction): void => {
  const { statusCode, message } = normalizeError(err);

  const logLine = `${statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`;

  // Server-side faults are the ones an operator needs to act on; expected
  // client errors would otherwise drown them out at error level.
  if (statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
    logger.error(logLine, err.stack);
  } else {
    logger.warn(logLine);
  }

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
};

export default errorHandler;
