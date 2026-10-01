import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { SESSION_COOKIE, credentialStamp, safeEqual } from '../middleware/auth.js';
import { HttpError } from '../utils/http.js';

const cookieOptions = () => ({ httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/' });

export function login(req, res) {
  const { email, password } = req.body;
  const emailOk = safeEqual(email, config.adminEmail);
  const passwordOk = safeEqual(password, config.adminPassword);
  if (!(emailOk && passwordOk)) throw new HttpError(401, 'Invalid email or password');
  const token = jwt.sign({ sub: config.adminEmail, v: credentialStamp() }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${config.sessionDays}d`,
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: config.sessionDays * 86_400_000 });
  res.json({ email: config.adminEmail });
}

export function logout(req, res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.status(204).end();
}

export function me(req, res) {
  res.json({ email: req.user.email });
}
