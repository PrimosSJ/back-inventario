import { Router } from 'express';

const router = Router();
import { getPrestamos, addPrestamo, marcarDevuelto, getPrestamo, getPrestamosRut, getPrestamosPendientes, getPrestamosEspecialesPendientes } from '../controllers/prestamoController.js';

router.get('/', getPrestamos);
router.post('/', addPrestamo);
router.get('/pendientes', getPrestamosPendientes);
router.get('/pendientes-especiales', getPrestamosEspecialesPendientes);
router.patch('/return/:id', marcarDevuelto);
router.get('/:id/', getPrestamo);
router.get('/history/:rut', getPrestamosRut);

export default router;
