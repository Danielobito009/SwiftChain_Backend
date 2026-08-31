/**
 * Application-level error carrying an HTTP status code.
 *
 * Thrown by services/controllers and translated into a structured JSON
 * response by the global error handler middleware.
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
    return new ApiError(400, message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, message);
  }
}

export default ApiError;
