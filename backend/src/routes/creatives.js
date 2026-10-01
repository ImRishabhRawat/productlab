import { Router } from 'express';
import { creativeListQuery, creativeSchema, creativeUpdateSchema } from '@product-lab/shared/schemas';
import * as c from '../controllers/creatives.js';
import { validate, validIdParam } from '../middleware/validate.js';

const r = Router();
r.param('id', validIdParam);
r.get('/', validate({ query: creativeListQuery }), c.list);
r.post('/', validate({ body: creativeSchema }), c.create);
r.patch('/:id', validate({ body: creativeUpdateSchema }), c.update);
r.delete('/:id', c.remove);

export default r;
