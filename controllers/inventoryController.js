import Objeto from '../models/inventario.js';

export const getInventory = async (req, res) => {
    try {
        const inventario = await Objeto.find();
        res.json(inventario);
    } catch (error) {
        console.error('Error en getInventory:', error);
        res.status(500).json({ message: error.message });
    }
}

export const addItem = async (req, res) => {
    try {
        const { nombre, descripcion, categoria, tipo, extensiones, tipo_prestamo } = req.body;
        let { stock } = req.body;

        const itemTipo = tipo || "unitario";
        const itemTipoPrestamo = tipo_prestamo || "publico";

        let extensionesNormalizadas = [];

        if (itemTipo === "categoria") {
            if (!Array.isArray(extensiones) || extensiones.length === 0) {
                return res.status(400).json({ message: 'Una categoría debe tener al menos una extensión' });
            }

            const codigos = extensiones.map(e => e.codigo);
            const codigosUnicos = new Set(codigos);
            if (codigosUnicos.size !== codigos.length) {
                return res.status(400).json({ message: 'Los códigos de las extensiones deben ser únicos' });
            }

            extensionesNormalizadas = extensiones.map(e => ({
                codigo: e.codigo,
                disponible: e.disponible !== undefined ? Boolean(e.disponible) : true
            }));

            stock = extensionesNormalizadas.length;
        } else {
            stock = parseInt(stock);
            if (isNaN(stock) || stock < 0) {
                return res.status(400).json({ message: 'El stock no puede ser negativo' });
            }
        }

        const newObjeto = new Objeto({
            nombre,
            descripcion,
            categoria,
            stock,
            tipo: itemTipo,
            extensiones: extensionesNormalizadas,
            tipo_prestamo: itemTipoPrestamo
        });
        await newObjeto.save();
        res.status(201).json(newObjeto);
    } catch (error) {
        console.error('Error en addItem:', error);
        res.status(400).json({ message: error.message });
    }
}

export const deleteItem = async (req, res) => {
    try {
        const { id } = req.params;
        await Objeto.findByIdAndDelete(id);
        res.json({ message: 'Objeto eliminado' });
    } catch (error) {
        console.error('Error en deleteItem:', error);
        res.status(500).json({ message: error.message });
    }
}

export const editItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, categoria, tipo, extensiones, tipo_prestamo } = req.body;
        let { stock } = req.body;

        const update = {};
        if (nombre !== undefined) update.nombre = nombre;
        if (descripcion !== undefined) update.descripcion = descripcion;
        if (categoria !== undefined) update.categoria = categoria;
        if (tipo !== undefined) update.tipo = tipo;
        if (tipo_prestamo !== undefined) update.tipo_prestamo = tipo_prestamo;

        const tipoFinal = tipo !== undefined
            ? tipo
            : (await Objeto.findById(id))?.tipo;

        if (tipoFinal === "categoria") {
            if (extensiones !== undefined) {
                if (!Array.isArray(extensiones) || extensiones.length === 0) {
                    return res.status(400).json({ message: 'Una categoría debe tener al menos una extensión' });
                }

                const codigos = extensiones.map(e => e.codigo);
                const codigosUnicos = new Set(codigos);
                if (codigosUnicos.size !== codigos.length) {
                    return res.status(400).json({ message: 'Los códigos de las extensiones deben ser únicos' });
                }

                update.extensiones = extensiones.map(e => ({
                    codigo: e.codigo,
                    disponible: e.disponible !== undefined ? Boolean(e.disponible) : true
                }));
                update.stock = update.extensiones.length;
            }
        } else if (tipoFinal === "unitario") {
            if (stock !== undefined) {
                stock = parseInt(stock);
                if (isNaN(stock) || stock < 0) {
                    return res.status(400).json({ message: 'El stock no puede ser negativo' });
                }
                update.stock = stock;
            }
            if (tipo === "unitario") {
                update.extensiones = [];
            }
        }

        const objeto = await Objeto.findByIdAndUpdate(id, update, { new: true });
        res.json(objeto);
    } catch (error) {
        console.error('Error en editItem:', error);
        res.status(500).json({ message: error.message });
    }
}

export const getItem = async (req, res) => {
    try {
        const { id } = req.params;
        const objeto = await Objeto.findById(id);
        res.json(objeto);
    } catch (err) {
        console.error('Error en getItem:', err);
        res.status(500).json({ message: err.message });
    }
}

export const getCategorias = async (req, res) => {
    try {
        const categorias = await Objeto.distinct('categoria');
        res.json(categorias);
    } catch (error) {
        console.error('Error en getCategorias:', error);
        res.status(500).json({ message: error.message });
    }
}

export const getExtensiones = async (req, res) => {
    try {
        const { id } = req.params;
        const objeto = await Objeto.findById(id);
        if (!objeto) return res.status(404).json({ message: 'Objeto no encontrado' });
        if (objeto.tipo !== 'categoria') {
            return res.status(400).json({ message: 'El objeto no es de tipo categoría' });
        }
        res.json(objeto.extensiones);
    } catch (error) {
        console.error('Error en getExtensiones:', error);
        res.status(500).json({ message: error.message });
    }
}

export const getExtensionesDisponibles = async (req, res) => {
    try {
        const { id } = req.params;
        const objeto = await Objeto.findById(id);
        if (!objeto) return res.status(404).json({ message: 'Objeto no encontrado' });
        if (objeto.tipo !== 'categoria') {
            return res.status(400).json({ message: 'El objeto no es de tipo categoría' });
        }
        const disponibles = objeto.extensiones.filter(e => e.disponible);
        res.json(disponibles);
    } catch (error) {
        console.error('Error en getExtensionesDisponibles:', error);
        res.status(500).json({ message: error.message });
    }
}

export const bulkAddItems = async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Se requiere un array de items no vacío' });
    }

    const creados = [];
    const errores = [];

    for (let i = 0; i < items.length; i++) {
        const raw = items[i];
        try {
            const doc = new Objeto({
                nombre: raw.nombre,
                descripcion: raw.descripcion || '',
                categoria: raw.categoria,
                tipo: raw.tipo || 'unitario',
                tipo_prestamo: raw.tipo_prestamo || 'publico',
                stock: raw.tipo === 'categoria' ? 0 : (parseInt(raw.stock) || 0),
                extensiones: [],
            });
            await doc.save();
            creados.push(doc._id);
        } catch (err) {
            console.error(`Error en bulkAddItems fila ${i + 1}:`, err);
            errores.push({ fila: i + 1, nombre: raw.nombre || '(sin nombre)', error: err.message });
        }
    }

    res.status(207).json({
        total: items.length,
        creados: creados.length,
        errores: errores.length,
        detalle_errores: errores,
    });
}
