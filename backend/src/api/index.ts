import type { Express } from 'express';
import authRoutes from './auth.routes.js';
import organisationRoutes from './organisation.routes.js';
import conversationRoutes from './conversation.routes.js';

export function registerRoutes(app: Express): void {
  app.use('/api/auth', authRoutes);
  app.use('/api/organisations', organisationRoutes);
  app.use('/api/conversations', conversationRoutes);
}
