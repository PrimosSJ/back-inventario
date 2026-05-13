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
    updateExtensionComentario,
    bulkAddItems
} from '../controllers/inventoryController.js';

router.get('/', getInventory);
router.post('/', addItem);
router.post('/bulk', bulkAddItems);
router.get('/categorias', getCategorias);
router.get('/:id/extensiones-disponibles', getExtensionesDisponibles);
router.get('/:id/extensiones', getExtensiones);
router.patch('/:id/extensiones/:codigo/comentario', updateExtensionComentario);
router.delete('/:id', deleteItem);
router.put('/:id', editItem);
router.get('/:id', getItem);

export default router;
