import { MIN_DATE } from '@product-lab/shared/constants';
import { fieldErrors, isoDate, objectId } from '@product-lab/shared/schemas';
import { HttpError, badRequest, notFound } from '../utils/http.js';

export const validate =
  ({ body, query }) =>
  (req, res, next) => {
    if (body) {
      const r = body.safeParse(req.body ?? {});
      if (!r.success) return next(new HttpError(400, 'Please fix the highlighted fields', fieldErrors(r.error)));
      req.body = r.data;
    }
    if (query) {
      const r = query.safeParse(req.query ?? {});
      if (!r.success) return next(new HttpError(400, 'Invalid filters', fieldErrors(r.error)));
      req.filters = r.data;
    }
    next();
  };

export function validIdParam(req, res, next, value) {
  if (!objectId.safeParse(value).success) return next(notFound());
  next();
}

export function validDateParam(req, res, next, value) {
  if (!isoDate.safeParse(value).success) return next(badRequest('Use a YYYY-MM-DD date'));
  if (value < MIN_DATE) return next(badRequest(`Use a date from ${MIN_DATE.slice(0, 4)} onwards`));
  next();
}
