import { Router } from 'express';
import { convertIdeaSchema, ideaListQuery, ideaSchema, ideaUpdateSchema } from '@product-lab/shared/schemas';
import * as c from '../controllers/ideas.js';
import { validate, validIdParam } from '../middleware/validate.js';

const r = Router();
r.param('id', validIdParam);
r.get('/', validate({ query: ideaListQuery }), c.list);
r.post('/', validate({ body: ideaSchema }), c.create);
r.get('/:id', c.get);
r.patch('/:id', validate({ body: ideaUpdateSchema }), c.update);
r.delete('/:id', c.remove);
r.post('/:id/convert', validate({ body: convertIdeaSchema }), c.convert);

export default r;
