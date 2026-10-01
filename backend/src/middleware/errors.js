import { HttpError } from '../utils/http.js';

export function apiNotFound(req, res) {
  res.status(404).json({ error: { message: 'Not found' } });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { message: err.message, fields: err.fields } });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { message: 'Invalid JSON body' } });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: { message: 'Request is too large' } });
  if (err?.expose && err.status >= 400 && err.status < 500) {
    const message = err.status === 415 ? 'Unsupported request encoding' : 'Invalid request body';
    return res.status(err.status).json({ error: { message } });
  }
  if (err?.name === 'CastError') return res.status(400).json({ error: { message: `Invalid value for ${err.path}` } });
  if (err?.name === 'ValidationError') {
    const fields = Object.fromEntries(Object.entries(err.errors ?? {}).map(([k, v]) => [k, v.message]));
    return res.status(400).json({ error: { message: 'Please fix the highlighted fields', fields } });
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0];
    return res.status(409).json({ error: { message: `${field ?? 'Record'} already exists`, fields: field ? { [field]: 'Already exists' } : undefined } });
  }
  console.error(err);
  res.status(500).json({ error: { message: 'Something went wrong' } });
}
