import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginSchema } from '@product-lab/shared/schemas';
import * as auth from '../controllers/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { apiNotFound } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import ai from './ai.js';
import analytics from './analytics.js';
import creatives from './creatives.js';
import customers from './customers.js';
import decisions from './decisions.js';
import experiments from './experiments.js';
import ideas from './ideas.js';
import metrics from './metrics.js';
import orders from './orders.js';
import {
  focusRoutes,
  goalRoutes,
  habitRoutes,
  notificationRoutes,
  outcomeRoutes,
  preferenceRoutes,
  productivityRoutes,
  pushRoutes,
  reviewRoutes,
  timeBlockRoutes,
} from './personal.js';
import products from './products.js';
import settings from './settings.js';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { message: 'Too many sign-in attempts. Try again in 15 minutes.' } },
});

const api = Router();
api.post('/auth/login', loginLimiter, validate({ body: loginSchema }), auth.login);
api.post('/auth/logout', auth.logout);
api.get('/auth/me', requireAuth, auth.me);
api.use(requireAuth);
api.use('/settings', settings);
api.use('/ideas', ideas);
api.use('/products', products);
api.use('/experiments', experiments);
api.use('/creatives', creatives);
api.use('/metrics', metrics);
api.use('/decisions', decisions);
api.use('/customers', customers);
api.use('/orders', orders);
api.use('/analytics', analytics);
api.use('/ai', ai);
api.use('/goals', goalRoutes);
api.use('/time-blocks', timeBlockRoutes);
api.use('/daily-outcomes', outcomeRoutes);
api.use('/focus-sessions', focusRoutes);
api.use('/habits', habitRoutes);
api.use('/reviews', reviewRoutes);
api.use('/productivity', productivityRoutes);
api.use('/notifications', notificationRoutes);
api.use('/notification-preferences', preferenceRoutes);
api.use('/push', pushRoutes);
api.use(apiNotFound);

export default api;
