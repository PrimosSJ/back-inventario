import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const URI = process.env.MONGO_DB_URI;
if (!URI) {
    console.error('Error: MONGO_DB_URI no está definida en el entorno.');
    process.exit(1);
}

async function run() {
    await mongoose.connect(URI);
    const db = mongoose.connection.db;

    // ─── Objetos (inventario) ──────────────────────────────────────────────────

    console.log('=== Migración de objetos ===');

    const objetos = db.collection('objetos');

    let r;

    r = await objetos.updateMany(
        { tipo: { $exists: false } },
        { $set: { tipo: 'unitario' } }
    );
    console.log(`- Documentos con tipo asignado: ${r.modifiedCount}`);

    r = await objetos.updateMany(
        { tipo_prestamo: { $exists: false } },
        { $set: { tipo_prestamo: 'publico' } }
    );
    console.log(`- Documentos con tipo_prestamo asignado: ${r.modifiedCount}`);

    r = await objetos.updateMany(
        { extensiones: { $exists: false } },
        { $set: { extensiones: [] } }
    );
    console.log(`- Documentos con extensiones asignadas: ${r.modifiedCount}`);

    r = await objetos.updateMany(
        { precio: { $exists: true } },
        { $unset: { precio: '' } }
    );
    console.log(`- Documentos con precio eliminado: ${r.modifiedCount}`);

    r = await objetos.updateMany(
        { timestamp: { $exists: true } },
        { $unset: { timestamp: '' } }
    );
    console.log(`- Documentos con timestamp eliminado: ${r.modifiedCount}`);

    // ─── Préstamos ─────────────────────────────────────────────────────────────

    console.log('\n=== Migración de prestamos ===');

    const prestamos = db.collection('prestamos');

    r = await prestamos.updateMany(
        { tipo_prestamo: { $exists: false } },
        { $set: { tipo_prestamo: 'publico' } }
    );
    console.log(`- Documentos con tipo_prestamo asignado: ${r.modifiedCount}`);

    r = await prestamos.updateMany(
        { email: { $exists: false } },
        { $set: { email: '' } }
    );
    console.log(`- Documentos con email asignado: ${r.modifiedCount}`);

    r = await prestamos.updateMany(
        { monto: { $exists: true } },
        { $unset: { monto: '' } }
    );
    console.log(`- Documentos con monto eliminado: ${r.modifiedCount}`);

    r = await prestamos.updateMany(
        { timestamp: { $exists: true } },
        { $unset: { timestamp: '' } }
    );
    console.log(`- Documentos con timestamp eliminado: ${r.modifiedCount}`);

    console.log('\nMigración completada exitosamente.');
}

run()
    .catch((err) => {
        console.error('\nError durante la migración:', err.message);
        process.exit(1);
    })
    .finally(() => mongoose.connection.close());
