import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Error as MongooseError } from 'mongoose';
import logger from '../config/logger';
import AppError from '../utils/AppError';
import env from '../config/env';

const handleCastErrorDB = (err: MongooseError.CastError): AppError => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err: { errmsg?: string; code?: number }): AppError => {
  const value = err.errmsg?.match(/(["'])(\\?.)*?\1/)?.[0] || '';
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err: MongooseError.ValidationError): AppError => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const sendErrorDev = (err: AppError, _req: Request, res: Response): void => {
  res.status(err.statusCode).json({
    status: 'error',
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

const sendErrorProd = (err: AppError, _req: Request, res: Response): void => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  } else {
    logger.error('ERROR 💥', err);

    res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!',
    });
  }
};

const errorHandler = (
  err: Error & {
    statusCode?: number;
    name?: string;
    code?: number;
    errmsg?: string;
    errors?: Record<string, MongooseError.ValidatorError>;
    issues?: z.ZodIssue[];
  },
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let error: AppError;

  if (err.name === 'CastError') {
    error = handleCastErrorDB(err as MongooseError.CastError);
  } else if (err.code === 11000) {
    error = handleDuplicateFieldsDB(err);
  } else if (err.name === 'ValidationError') {
    error = handleValidationErrorDB(err as MongooseError.ValidationError);
  } else if (err instanceof z.ZodError) {
    error = new AppError('Validation failed', 400);
  } else if (err instanceof AppError) {
    error = err;
  } else if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token', 401);
  } else if (err.name === 'TokenExpiredError') {
    error = new AppError('Token has expired', 401);
  } else {
    error = new AppError(err.message || 'Internal Server Error', err.statusCode || 500);
  }

  logger.error(
    `${error.statusCode} - ${error.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`,
  );

  if (env.NODE_ENV === 'development') {
    sendErrorDev(error, req, res);
  } else {
    sendErrorProd(error, req, res);
  }
};

export default errorHandler;
