import { Router } from 'express';
import { orderListQuery, orderSchema, orderUpdateSchema } from '@product-lab/shared/schemas';
import * as c from '../controllers/orders.js';
import { validate, validIdParam } from '../middleware/validate.js';

const r = Router();
r.param('id', validIdParam);
r.get('/', validate({ query: orderListQuery }), c.list);
r.post('/', validate({ body: orderSchema }), c.create);
r.get('/:id', c.get);
r.patch('/:id', validate({ body: orderUpdateSchema }), c.update);
r.delete('/:id', c.remove);

export default r;
