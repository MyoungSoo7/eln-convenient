import { Router } from 'express';
import * as ctrl from '../controllers/inventory.controller';

const router = Router();

router.get('/items', ctrl.getItems);
router.post('/items', ctrl.createItem);
router.get('/items/:id', ctrl.getItemById);
router.put('/items/:id', ctrl.updateItem);
router.delete('/items/:id', ctrl.deleteItem);
router.get('/categories', ctrl.getCategories);

export default router;
