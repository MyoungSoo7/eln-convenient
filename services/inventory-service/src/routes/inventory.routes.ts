import { Router } from 'express';
import * as ctrl from '../controllers/inventory.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/items',         requirePermission('inventory:read'),    ctrl.getItems);
router.post('/items',        requirePermission('inventory:write'),   ctrl.createItem);
router.get('/items/:id',     requirePermission('inventory:read'),    ctrl.getItemById);
router.put('/items/:id',     requirePermission('inventory:write'),   ctrl.updateItem);
router.delete('/items/:id',  requirePermission('inventory:delete'),  ctrl.deleteItem);
router.get('/categories',    requirePermission('inventory:read'),    ctrl.getCategories);

export default router;
