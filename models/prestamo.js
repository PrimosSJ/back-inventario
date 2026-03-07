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
    id_producto: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Objeto',
        required: true
    },
    nombre_producto: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    monto: {
        type: Number,
        required: true
    },
    finalizado: {
        type: Boolean,
        default: false
    },
    comentario: {
        type: String
    }
});

export default mongoose.model('Prestamo', prestamoSchema);