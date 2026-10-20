import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isTest } from './config/env.js';
import { logger } from './lib/logger.js';
import { loadUser } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter, originCheck, sanitizeBody } from './middleware/security.js';
import adminRoutes from './routes/admin/index.js';
import authRoutes from './routes/auth.js';
import billingRoutes from './routes/billing.js';
import biodataRoutes from './routes/biodatas.js';
import meRoutes from './routes/me.js';
import publicRoutes from './routes/public.js';
import supportRoutes from './routes/support.js';
import uploadRoutes from './routes/uploads.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  if (!isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // Uploads take raw bodies, so they are mounted before the JSON parser.
  app.use('/api/uploads', uploadRoutes);

  app.use(express.json({ limit: '200kb' }));
  app.use(sanitizeBody);
  app.use('/api', originCheck, apiLimiter, loadUser);

  app.use('/api/auth', authRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/biodatas', biodataRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', billingRoutes);
  app.use('/api', supportRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
