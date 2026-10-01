import { Router } from 'express';
import {
  productEventSchema,
  productListQuery,
  productSchema,
  productUpdateSchema,
  versionSchema,
} from '@product-lab/shared/schemas';
import * as c from '../controllers/products.js';
import { validate, validIdParam } from '../middleware/validate.js';

const r = Router();
r.param('id', validIdParam);
r.param('eventId', validIdParam);
r.param('versionId', validIdParam);
r.get('/', validate({ query: productListQuery }), c.list);
r.post('/', validate({ body: productSchema }), c.create);
r.get('/:id', c.get);
r.patch('/:id', validate({ body: productUpdateSchema }), c.update);
r.get('/:id/timeline', c.timeline);
r.post('/:id/events', validate({ body: productEventSchema }), c.addEvent);
r.delete('/:id/events/:eventId', c.removeEvent);
r.get('/:id/versions', c.listVersions);
r.post('/:id/versions', validate({ body: versionSchema }), c.addVersion);
r.delete('/:id/versions/:versionId', c.removeVersion);

export default r;
