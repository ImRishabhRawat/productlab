import { Router } from 'express';
import { metricImportSchema, metricListQuery, metricSchema, metricUpdateSchema } from '@product-lab/shared/schemas';
import * as c from '../controllers/metrics.js';
import { validate, validIdParam } from '../middleware/validate.js';

const r = Router();
r.param('id', validIdParam);
r.get('/', validate({ query: metricListQuery }), c.list);
r.post('/', validate({ body: metricSchema }), c.create);
r.post('/import', validate({ body: metricImportSchema }), c.importRows);
r.patch('/:id', validate({ body: metricUpdateSchema }), c.update);
r.delete('/:id', c.remove);

export default r;
