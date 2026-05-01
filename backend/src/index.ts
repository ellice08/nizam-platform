import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import logger from './utils/logger.js';
import { AppError } from './utils/errors.js';
import { ApiResponse } from './utils/response.js';
import { testConnection } from './lib/test-connection.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json(ApiResponse.success({ status: 'ok' }, 'Service is healthy'));
});

app.get('/health/db', async (_req: Request, res: Response) => {
  const result = await testConnection();
  if (result.connected) {
    res.json({ connected: true });
  } else {
    res.status(503).json({ connected: false, error: result.error });
  }
});

function registerRoutes(_app: typeof app): void {
  // TODO: register route handlers here
}

registerRoutes(app);

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('Route not found', 404));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(ApiResponse.error(err.message));
    return;
  }

  logger.error('Unhandled error', { err });
  res.status(500).json(ApiResponse.error('Internal server error'));
});

app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
});

export default app;
