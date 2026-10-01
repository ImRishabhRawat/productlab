import { Router } from 'express';
import { aiAnalyzeSchema, aiListQuery } from '@product-lab/shared/schemas';
import * as c from '../controllers/ai.js';
import { validate, validIdParam } from '../middleware/validate.js';

const r = Router();
r.param('id', validIdParam);
r.get('/status', c.status);
r.get('/analyses', validate({ query: aiListQuery }), c.list);
r.get('/analyses/:id', c.get);
r.delete('/analyses/:id', c.remove);
r.post('/analyze', validate({ body: aiAnalyzeSchema }), c.analyze);

export default r;
