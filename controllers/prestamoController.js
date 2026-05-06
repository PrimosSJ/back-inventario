import Prestamo from '../models/prestamo.js';
import Objeto from '../models/inventario.js';

export const getPrestamos = async (req, res) => {
    try {
        const prestamos = await Prestamo.find();
        res.json(prestamos);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const addPrestamo = async (req, res) => {
    const {
        rut,
        nombre,
        email,
        telefono,
        id_producto,
        tipo_prestamo,
        extension_codigo,
        fecha_devolucion_esperada,
        comentario
    } = req.body;

    if (!rut || !id_producto || !nombre || !email || !tipo_prestamo) {
        return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    if (!["publico", "especial"].includes(tipo_prestamo)) {
        return res.status(400).json({ message: 'Tipo de préstamo inválido' });
    }

    if (tipo_prestamo === "especial") {
        if (!telefono || !fecha_devolucion_esperada) {
            return res.status(400).json({
                message: 'Teléfono y fecha de devolución esperada son obligatorios para préstamos especiales'
            });
        }
    }

    try {
        const item = await Objeto.findById(id_producto);
        if (!item) return res.status(404).json({ message: 'Producto no encontrado' });

        let extensionCodigoFinal;

        if (item.tipo === "categoria") {
            if (!extension_codigo) {
                return res.status(400).json({
                    message: 'Debe especificar la extensión a prestar para un producto de tipo categoría'
                });
            }

            const extension = item.extensiones.find(e => e.codigo === extension_codigo);
            if (!extension) {
                return res.status(404).json({ message: 'Extensión no encontrada' });
            }
            if (!extension.disponible) {
                return res.status(400).json({ message: 'La extensión no está disponible' });
            }

            extension.disponible = false;
            await item.save();
            extensionCodigoFinal = extension_codigo;
        } else {
            if (item.stock < 1) return res.status(400).json({ message: 'Producto no disponible' });
            item.stock--;
            await item.save();
        }

        const newPrestamo = new Prestamo({
            rut,
            nombre,
            email,
            telefono,
            id_producto,
            nombre_producto: item.nombre,
            tipo_prestamo,
            extension_codigo: extensionCodigoFinal,
            fecha_devolucion_esperada,
            comentario
        });
        await newPrestamo.save();
        res.status(201).json(newPrestamo);

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

export async function marcarDevuelto(req, res) {
    try {
        const { id } = req.params;
        const prestamo = await Prestamo.findById(id);

        if (!prestamo) return res.status(404).json({ message: 'Prestamo no encontrado' });
        if (prestamo.finalizado) return res.status(400).json({ message: 'Prestamo ya finalizado' });

        prestamo.finalizado = true;
        await prestamo.save();

        const item = await Objeto.findById(prestamo.id_producto);
        if (item) {
            if (prestamo.extension_codigo) {
                const extension = item.extensiones.find(e => e.codigo === prestamo.extension_codigo);
                if (extension) {
                    extension.disponible = true;
                    await item.save();
                }
            } else {
                item.stock++;
                await item.save();
            }
        }

        res.json(prestamo);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export async function getPrestamo(req, res) {
    try {
        const prestamo = await Prestamo.findById(req.params.id);
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
        if (!prestamos) return res.status(404).json({ message: 'No hay prestamos pendientes' });
        res.json(prestamos);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export async function getPrestamosEspecialesPendientes(req, res) {
    try {
        const prestamos = await Prestamo.find({
            finalizado: false,
            tipo_prestamo: 'especial',
            fecha_devolucion_esperada: { $exists: true, $ne: null },
        });
        res.json(prestamos);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
