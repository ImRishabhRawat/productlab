import { Router } from 'express';
import { experimentListQuery, experimentSchema, experimentUpdateSchema } from '@product-lab/shared/schemas';
import * as c from '../controllers/experiments.js';
import { validate, validIdParam } from '../middleware/validate.js';

const r = Router();
r.param('id', validIdParam);
r.get('/', validate({ query: experimentListQuery }), c.list);
r.post('/', validate({ body: experimentSchema }), c.create);
r.get('/:id', c.get);
r.patch('/:id', validate({ body: experimentUpdateSchema }), c.update);
r.delete('/:id', c.remove);

export default r;
