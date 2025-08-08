import express from 'express';
import { login, register, verifyToken, verifyTokenRoute } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/verify-token', verifyToken, verifyTokenRoute);

export default router;