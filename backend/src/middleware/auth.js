import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../utils/http.js';

export const SESSION_COOKIE = 'pl_session';

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();
export const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));
export const credentialStamp = () =>
  crypto.createHmac('sha256', config.jwtSecret).update(`${config.adminEmail}:${config.adminPassword}`).digest('hex').slice(0, 32);

export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next(new HttpError(401, 'Not signed in'));
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (payload.v !== credentialStamp()) throw new Error('stale');
    req.user = { email: payload.sub };
    next();
  } catch {
    next(new HttpError(401, 'Session expired'));
  }
}
