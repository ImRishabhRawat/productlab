import { Router } from 'express';
import { rangeQuery } from '@product-lab/shared/schemas';
import * as c from '../controllers/analytics.js';
import { validate } from '../middleware/validate.js';

const r = Router();
r.use(validate({ query: rangeQuery }));
r.get('/summary', c.summary);
r.get('/timeseries', c.timeseries);
r.get('/products', c.products);
r.get('/experiments', c.experiments);
r.get('/creatives', c.creatives);
r.get('/lifecycle', c.lifecycle);
r.get('/scaling', c.scaling);
r.get('/graveyard', c.graveyard);
r.get('/orders', c.orders);
r.get('/customers', c.customers);
r.get('/activity', c.activity);

export default r;
