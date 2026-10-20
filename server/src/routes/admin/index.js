import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import billing from './billing.js';
import biodatas from './biodatas.js';
import content from './content.js';
import insights from './insights.js';
import moderation from './moderation.js';
import users from './users.js';

const router = Router();

// Every admin route needs a staff account; each route then checks its own permission.
router.use(requireAuth, requirePermission('admin.access'));
router.use(insights);
router.use(biodatas);
router.use(users);
router.use(billing);
router.use(moderation);
router.use(content);

export default router;
