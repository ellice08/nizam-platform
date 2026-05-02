import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { ApiResponse } from '../utils/response.js';
import logger from '../utils/logger.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(ApiResponse.error(err.message));
    return;
  }
  logger.error('Unhandled error', { err });
  res.status(500).json(ApiResponse.error('Internal server error'));
}
