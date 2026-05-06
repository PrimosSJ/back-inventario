import mongoose from "mongoose";

const extensionSchema = new mongoose.Schema({
    codigo: {
        type: String,
        required: true
    },
    disponible: {
        type: Boolean,
        default: true
    }
}, { _id: false });

const objetoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true
    },
    descripcion: {
        type: String,
        required: true
    },
    categoria: {
        type: String,
        required: true
    },
    stock: {
        type: Number,
        required: true
    },
    tipo: {
        type: String,
        required: true,
        enum: ["unitario", "categoria"],
        default: "unitario"
    },
    extensiones: {
        type: [extensionSchema],
        default: []
    },
    tipo_prestamo: {
        type: String,
        required: true,
        enum: ["publico", "especial"],
        default: "publico"
    }
}, { timestamps: true });

export default mongoose.model('Objeto', objetoSchema);