import type { Express } from 'express';
import tenantRoutes from './tenant.routes.js';
import conversationRoutes from './conversation.routes.js';

export function registerRoutes(app: Express): void {
  app.use('/api/tenants', tenantRoutes);
  app.use('/api/conversations', conversationRoutes);
}
