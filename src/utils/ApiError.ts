import { StatusCodes } from 'http-status-codes';

/**
 * Application-level error carrying an HTTP status code.
 *
 * Thrown by the validator, service and controller layers and translated into a
 * structured JSON response by the global error-handling middleware. Errors
 * flagged as operational are expected failures (bad input, missing records)
 * as opposed to programmer errors, which should surface as 500s.
 */
export class ApiError extends Error {
  public readonly statusCode: number;

  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = new.target.name;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string): ApiError {
    return new ApiError(StatusCodes.BAD_REQUEST, message);
  }

  static unauthorized(message: string): ApiError {
    return new ApiError(StatusCodes.UNAUTHORIZED, message);
  }

  static forbidden(message: string): ApiError {
    return new ApiError(StatusCodes.FORBIDDEN, message);
  }

  static notFound(message: string): ApiError {
    return new ApiError(StatusCodes.NOT_FOUND, message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(StatusCodes.CONFLICT, message);
  }

  static tooManyRequests(message: string): ApiError {
    return new ApiError(StatusCodes.TOO_MANY_REQUESTS, message);
  }
}

export default ApiError;
