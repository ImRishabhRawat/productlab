import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  dailyOutcomeSchema,
  dailyReviewSchema,
  focusListQuery,
  focusStartSchema,
  focusUpdateSchema,
  goalListQuery,
  goalSchema,
  goalUpdateSchema,
  habitSchema,
  habitUpdateSchema,
  notificationListQuery,
  notificationPrefsSchema,
  productivityRangeQuery,
  productivitySeriesQuery,
  pushEndpointSchema,
  pushSubscribeSchema,
  timeBlockSchema,
  timeBlockUpdateSchema,
  weekQuery,
  weeklyReviewSchema,
} from '@product-lab/shared/schemas';
import * as outcomes from '../controllers/dailyOutcomes.js';
import * as focus from '../controllers/focusSessions.js';
import * as goals from '../controllers/goals.js';
import * as habits from '../controllers/habits.js';
import * as notifications from '../controllers/notifications.js';
import * as productivity from '../controllers/productivity.js';
import * as reviews from '../controllers/reviews.js';
import * as blocks from '../controllers/timeBlocks.js';
import { validDateParam, validate, validIdParam } from '../middleware/validate.js';

const router = () => {
  const r = Router();
  r.param('id', validIdParam);
  r.param('date', validDateParam);
  r.param('weekStart', validDateParam);
  return r;
};

const range = validate({ query: productivityRangeQuery });

export const goalRoutes = router()
  .get('/', validate({ query: goalListQuery }), goals.list)
  .post('/', validate({ body: goalSchema }), goals.create)
  .get('/:id', goals.get)
  .patch('/:id', validate({ body: goalUpdateSchema }), goals.update)
  .delete('/:id', goals.remove);

export const timeBlockRoutes = router()
  .get('/', blocks.list)
  .post('/', validate({ body: timeBlockSchema }), blocks.create)
  .patch('/:id', validate({ body: timeBlockUpdateSchema }), blocks.update)
  .delete('/:id', blocks.remove);

export const outcomeRoutes = router()
  .get('/', range, outcomes.list)
  .get('/:date', outcomes.get)
  .put('/:date', validate({ body: dailyOutcomeSchema }), outcomes.put);

export const focusRoutes = router()
  .get('/', validate({ query: focusListQuery }), focus.list)
  .post('/', validate({ body: focusStartSchema }), focus.start)
  .patch('/:id', validate({ body: focusUpdateSchema }), focus.update)
  .delete('/:id', focus.remove);

export const habitRoutes = router()
  .get('/', habits.list)
  .get('/completions', range, habits.completions)
  .post('/', validate({ body: habitSchema }), habits.create)
  .patch('/:id', validate({ body: habitUpdateSchema }), habits.update)
  .delete('/:id', habits.remove)
  .put('/:id/completions/:date', habits.complete)
  .delete('/:id/completions/:date', habits.uncomplete);

export const reviewRoutes = router()
  .get('/daily', range, reviews.listDaily)
  .get('/daily/:date', reviews.getDaily)
  .put('/daily/:date', validate({ body: dailyReviewSchema }), reviews.putDaily)
  .get('/weekly', validate({ query: weekQuery }), reviews.getWeekly)
  .put('/weekly/:weekStart', validate({ body: weeklyReviewSchema }), reviews.putWeekly);

export const productivityRoutes = router()
  .get('/today', productivity.today)
  .get('/series', validate({ query: productivitySeriesQuery }), productivity.series);

export const notificationRoutes = router()
  .get('/', validate({ query: notificationListQuery }), notifications.list)
  .get('/unread-count', notifications.unread)
  .post('/read-all', notifications.markAllRead)
  .post('/:id/read', notifications.markRead)
  .delete('/:id', notifications.remove);

export const preferenceRoutes = router()
  .get('/', notifications.getPreferences)
  .patch('/', validate({ body: notificationPrefsSchema }), notifications.updatePreferences);

const testLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { message: 'Too many test notifications. Try again in a minute.' } },
});

export const pushRoutes = router()
  .get('/key', notifications.pushKey)
  .post('/subscribe', validate({ body: pushSubscribeSchema }), notifications.subscribe)
  .post('/unsubscribe', validate({ body: pushEndpointSchema }), notifications.unsubscribe)
  .get('/devices', notifications.devices)
  .delete('/devices/:id', notifications.removeDevice)
  .post('/test', testLimiter, notifications.test);
