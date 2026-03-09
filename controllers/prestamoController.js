import Prestamo from '../models/prestamo.js';
import Objeto from '../models/inventario.js';

export const getPrestamos= async (req, res) => {
    try {
        const prestamos = await Prestamo.find();
        res.json(prestamos);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const addPrestamo = async (req, res) => {
    const { rut, nombre, id_producto, comentario} = req.body;

    if (!rut || !id_producto || !nombre) {
        return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    try {
        const item = await Objeto.findById(id_producto);
        if (!item) return res.status(404).json({ message: 'Producto no encontrado' });
        if (item.stock < 1) return res.status(400).json({ message: 'Producto no disponible' });
        item.stock--;
        await item.save();

        const newPrestamo = new Prestamo({ rut, nombre, id_producto, nombre_producto: item.nombre, monto: item.precio, comentario });
        await newPrestamo.save();
        res.status(201).json(newPrestamo);

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

/* export async function marcarDevuelto(req, res) {
    try {
        const { rut } = req.params;
        const prestamo = await Prestamo.findOne({ rut });

        if (!prestamo) return res.status(404).json({ message: 'Prestamo no encontrado' });
        if (prestamo.finalizado) return res.status(400).json({ message: 'Prestamo ya finalizado' });
        
        const item = await Objeto.findById(prestamo.id_producto);
        item.stock++;
        await item.save();

        prestamo.finalizado = true;
        await prestamo.save();

        res.json(prestamo);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
} */

export async function marcarDevuelto(req, res) {
    try {
        const id_prestamo = req.params;
        const prestamo = await Prestamo.findById(id_prestamo.id);

        if (!prestamo) return res.status(404).json({ message: 'Prestamo no encontrado' });
        if (prestamo.finalizado) return res.status(400).json({ message: 'Prestamo ya finalizado' });
        
        prestamo.finalizado = true;
        await prestamo.save();

        const item = await Objeto.findById(prestamo.id_producto);
        item.stock++;
        await item.save();

        res.json(prestamo);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export async function getPrestamo(req, res) {
    try {
        const prestamo = await Prestamo.findById(req.params._id);
        if (!prestamo) return res.status(404).json({ message: 'Prestamo no encontrado' });
        res.json(prestamo);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export async function getPrestamosRut(req, res) {
    try {
        const prestamos = await Prestamo.find({ rut: req.params.rut });
        res.json(prestamos);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export async function getPrestamosPendientes(req, res) {
    try {
        const prestamos = await Prestamo.find({ finalizado: false });
        if (!prestamos) return res.status(404).json({ message: 'No hay prestamos pendientes'});
        res.json(prestamos);
    }catch (error){
        res.status(500).json({ message: error.message });        
    }
}