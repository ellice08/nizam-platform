import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { env } from './config/env.js';
import logger from './utils/logger.js';
import { AppError } from './utils/errors.js';
import { ApiResponse } from './utils/response.js';
import { testConnection } from './lib/test-connection.js';
import { registerRoutes } from './api/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Widget endpoints — open CORS, must be FIRST
// before helmet and restrictive CORS
app.use(['/widget.js', '/api/widget'], cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: false,
}))

app.use(helmet());

const allowedOrigins = [
  'https://nizam-platform.vercel.app',
  env.FRONTEND_URL,
]

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true)

    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    return callback(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true,
}))
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

app.get('/widget.js', (_req: Request, res: Response) => {
  try {
    const widgetPath = join(__dirname, '../public/widget.js');
    const widgetScript = readFileSync(widgetPath, 'utf-8');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(widgetScript);
  } catch {
    res.status(404).send('// Widget not found');
  }
});

registerRoutes(app);

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('Route not found', 404));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(ApiResponse.error(err.message));
    return;
  }
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : ''
  logger.error(`Unhandled error: ${message}`, { stack });
  res.status(500).json(ApiResponse.error('Internal server error'));
});

const PORT = process.env.PORT ?? env.PORT ?? '4000'
const NODE_ENV = process.env.NODE_ENV ?? env.NODE_ENV ?? 'development'

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} [${NODE_ENV}]`);
});

export default app;
