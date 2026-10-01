import { Router } from 'express';
import { customerListQuery, customerSchema, customerUpdateSchema } from '@product-lab/shared/schemas';
import * as c from '../controllers/customers.js';
import { validate, validIdParam } from '../middleware/validate.js';

const r = Router();
r.param('id', validIdParam);
r.get('/', validate({ query: customerListQuery }), c.list);
r.post('/', validate({ body: customerSchema }), c.create);
r.get('/:id', c.get);
r.patch('/:id', validate({ body: customerUpdateSchema }), c.update);
r.delete('/:id', c.remove);

export default r;
