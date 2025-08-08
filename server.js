import express, { json } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connect } from 'mongoose';
import cors from 'cors';

// use env variables
import dotenv from 'dotenv';
dotenv.config();

import inventoryRoutes from './routes/inventoryRoutes.js';
import prestamosRoutes from './routes/prestamosRoutes.js';
import authRoutes from './routes/auth.js';

const corsOptions = {
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
};

const app = express();
app.use(cors(corsOptions));
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});

connect(process.env.MONGO_DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Conectado a la BD del POTO'))
.catch((error) => console.log('Error al conectar a la BD', error));

app.use(json());

app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use('/inventario', inventoryRoutes);
app.use('/prestamos', prestamosRoutes);
app.use('/auth', authRoutes);

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});