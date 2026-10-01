import { Router } from 'express';
import { settingsSchema } from '@product-lab/shared/schemas';
import * as c from '../controllers/settings.js';
import { validate } from '../middleware/validate.js';

const r = Router();
r.get('/', c.get);
r.patch('/', validate({ body: settingsSchema }), c.update);

export default r;
