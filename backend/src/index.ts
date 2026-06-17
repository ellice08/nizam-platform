import express from "express";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { env } from "./config/env.js";
import logger from "./utils/logger.js";
import { AppError } from "./utils/errors.js";
import { ApiResponse } from "./utils/response.js";
import { testConnection } from "./lib/test-connection.js";
import { registerRoutes } from "./api/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(helmet());

const allowedOrigins = [
  env.FRONTEND_URL,
  ...env.CORS_EXTRA_ORIGINS.split(',').map(o => o.trim()).filter(Boolean),
];

app.use((req: Request, res: Response, next: NextFunction) => {
  const isWidgetPath = req.path.startsWith("/api/widget");

  if (isWidgetPath) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
    return;
  }

  // Restrictive CORS for all other routes
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, x-tenant-org-id",
      );
      res.status(204).end();
      return;
    }
  } else {
    logger.warn(`CORS: blocked origin ${origin}`);
    res.status(403).json({ error: "CORS blocked" });
    return;
  }
  next();
});

app.use(morgan("dev"));
app.use(express.json({
  limit: "10mb",
  // Stash the raw buffer on req so webhook signature verification can use it.
  // The verify callback runs before JSON parsing; it's harmless for all other routes.
  verify: (req, _res, buf) => { (req as unknown as Record<string, unknown>)['rawBody'] = buf; },
}));

app.get("/health", (_req: Request, res: Response) => {
  res.json(ApiResponse.success({ status: "ok" }, "Service is healthy"));
});

app.get("/health/db", async (_req: Request, res: Response) => {
  const result = await testConnection();
  if (result.connected) {
    res.json({ connected: true });
  } else {
    res.status(503).json({ connected: false, error: result.error });
  }
});

registerRoutes(app);

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError("Route not found", 404));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(ApiResponse.error(err.message));
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : "";
  logger.error(`Unhandled error: ${message}`, { stack });
  res.status(500).json(ApiResponse.error("Internal server error"));
});

const PORT = process.env.PORT ?? env.PORT ?? "4000";
const NODE_ENV = process.env.NODE_ENV ?? env.NODE_ENV ?? "development";

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} [${NODE_ENV}]`);
});

export default app;
