import Objeto from '../models/inventario.js';

export const getInventory = async (req, res) => {
    try {
        const inventario = await Objeto.find();
        res.json(inventario);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const addItem = async (req, res) => {
    try {
        let params = req.body;

        params.precio = parseInt(params.precio);
        params.stock = parseInt(params.stock);

        if (params.stock < 0) {
            return res.status(400).json({ message: 'El stock no puede ser negativo' });
        }

        const newObjeto = new Objeto(params);
        await newObjeto.save();
        res.status(201).json(newObjeto);
    } catch (error) {
        res.status(400).json({ message: error.message }); 
    }
}

export const deleteItem = async (req, res) => {
    try {
        const { id } = req.params;
        await Objeto.findByIdAndDelete(id);
        res.json({ message: 'Objeto eliminado' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const editItem = async (req, res) => {
    try {
        const { id } = req.params;
        let { nombre, descripcion, precio, categoria, stock } = req.body;

        precio = parseInt(precio);
        stock = parseInt(stock);

        if (stock < 0) {
            return res.status(400).json({ message: 'El stock no puede ser negativo' });
        }

        const objeto = await Objeto.findByIdAndUpdate(id, { nombre, descripcion, precio, categoria, stock }, { new: true });
        res.json(objeto);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const getItem = async (req, res) => {
    try {
        const { id } = req.params;
        const objeto = await Objeto.findById(id);
        res.json(objeto);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}

export const getCategorias = async (req, res) => {
    try {
        const categorias = await Objeto.distinct('categoria');
        res.json(categorias);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

