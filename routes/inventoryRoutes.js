import { Router } from 'express';

const router = Router();
import {
    getInventory,
    addItem,
    deleteItem,
    editItem,
    getItem,
    getCategorias,
    getExtensiones,
    getExtensionesDisponibles,
    bulkAddItems
} from '../controllers/inventoryController.js';

router.get('/', getInventory);
router.post('/', addItem);
router.post('/bulk', bulkAddItems);
router.get('/categorias', getCategorias);
router.get('/:id/extensiones-disponibles', getExtensionesDisponibles);
router.get('/:id/extensiones', getExtensiones);
router.delete('/:id', deleteItem);
router.put('/:id', editItem);
router.get('/:id', getItem);

export default router;
