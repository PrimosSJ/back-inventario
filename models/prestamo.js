import mongoose from "mongoose";

const prestamoSchema = new mongoose.Schema({
    rut: {
        type: String,
        required: true
    },
    nombre: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    telefono: {
        type: String
    },
    id_producto: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Objeto',
        required: true
    },
    nombre_producto: {
        type: String,
        required: true
    },
    tipo_prestamo: {
        type: String,
        required: true,
        enum: ["publico", "especial"]
    },
    extension_codigo: {
        type: String
    },
    fecha_devolucion_esperada: {
        type: Date
    },
    finalizado: {
        type: Boolean,
        default: false
    },
    comentario: {
        type: String
    }
}, { timestamps: true });

export default mongoose.model('Prestamo', prestamoSchema);
