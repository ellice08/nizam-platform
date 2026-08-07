import type { Express } from 'express';
import authRoutes from './auth.routes.js';
import organisationRoutes from './organisation.routes.js';
import conversationRoutes from './conversation.routes.js';
import agentRoutes from './agent.routes.js';
import ingestRoutes from './ingest.routes.js';
import chatRoutes from './chat.routes.js';
import widgetRoutes from './widget.routes.js';
import usersRoutes from './users.routes.js';
import leadsRoutes from './leads.routes.js';
import supportRoutes from './support.routes.js';
import notificationRoutes from './notification.routes.js';
import intentRoutes from './intent.routes.js';
import analyticsRoutes from './analytics.routes.js';
import whatsappRoutes from './whatsapp.routes.js';
import voiceRoutes from './voice.routes.js';
import versionRoutes from './version.routes.js';
import navViewsRoutes from './navViews.routes.js';

export function registerRoutes(app: Express): void {
  app.use('/api/version', versionRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/organisations', organisationRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/ingest', ingestRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/widget', widgetRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/leads', leadsRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api', intentRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/voice', voiceRoutes);
  app.use('/api/nav-views', navViewsRoutes);
}
