import { Router } from 'express';
import { decisionListQuery, decisionSchema, decisionUpdateSchema } from '@product-lab/shared/schemas';
import * as c from '../controllers/decisions.js';
import { validate, validIdParam } from '../middleware/validate.js';

const r = Router();
r.param('id', validIdParam);
r.get('/', validate({ query: decisionListQuery }), c.list);
r.post('/', validate({ body: decisionSchema }), c.create);
r.patch('/:id', validate({ body: decisionUpdateSchema }), c.update);
r.delete('/:id', c.remove);

export default r;
