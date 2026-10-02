import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { HttpError } from './utils/http.js';
import api from './routes/index.js';

const distDir = fileURLToPath(new URL('../../frontend/dist', import.meta.url));
const assetsDir = `${path.sep}assets${path.sep}`;
const revalidate = new Set(['sw.js', 'manifest.webmanifest']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const importJson = express.json({ limit: '5mb' });
const signedInImportJson = (req, res, next) => requireAuth(req, res, (err) => (err ? next() : importJson(req, res, next)));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: config.cookieSecure ? [] : null } } }));
  app.use(cookieParser());
  app.use(['/api/orders/import', '/api/metrics/import'], signedInImportJson);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const site = req.get('sec-fetch-site');
    if (!SAFE_METHODS.has(req.method) && site && site !== 'same-origin') return next(new HttpError(403, 'Cross-site request blocked'));
    next();
  });
  app.use('/api', api);

  if (config.isProd && fs.existsSync(distDir)) {
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders: (res, file) => {
          if (file.includes(assetsDir)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else if (revalidate.has(path.basename(file))) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' || path.extname(req.path) || !req.accepts('html')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
