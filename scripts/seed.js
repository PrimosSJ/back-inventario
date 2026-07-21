/**
 * Seed de datos de prueba para POTO
 * ---------------------------------
 * Levanta datos mock realistas (usuarios, inventario y préstamos) para testear
 * el funcionamiento del sistema de trazabilidad de préstamos.
 *
 * Uso:
 *   node scripts/seed.js            # limpia las colecciones y reinserta datos mock
 *   node scripts/seed.js --keep     # NO borra nada, solo agrega los datos mock
 *   node scripts/seed.js --wipe     # solo limpia las colecciones y termina
 *
 * Respeta la lógica de negocio de los controllers:
 *   - Objeto "unitario": cada préstamo activo descuenta 1 de stock.
 *   - Objeto "categoria": cada préstamo activo marca esa extensión como no disponible.
 *
 * Seguridad: se niega a correr si NODE_ENV === 'production'.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

import User from '../models/User.js';
import Objeto from '../models/inventario.js';
import Prestamo from '../models/prestamo.js';

dotenv.config();

// ─── Configuración ───────────────────────────────────────────────────────────

const URI =
    process.env.MONGO_DB_URI && process.env.MONGO_DB_URI.startsWith('mongodb')
        ? process.env.MONGO_DB_URI
        : 'mongodb://localhost:27017/mydatabase';

const args = process.argv.slice(2);
const KEEP = args.includes('--keep');   // no limpiar, solo insertar
const WIPE_ONLY = args.includes('--wipe'); // solo limpiar y salir

if (process.env.NODE_ENV === 'production') {
    console.error('✋ NODE_ENV=production: el seed está deshabilitado para no tocar datos reales.');
    process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Calcula el dígito verificador de un RUT chileno (módulo 11). */
function calcularDV(num) {
    let suma = 0;
    let mul = 2;
    const digitos = String(num).split('').reverse();
    for (const d of digitos) {
        suma += parseInt(d, 10) * mul;
        mul = mul === 7 ? 2 : mul + 1;
    }
    const resto = 11 - (suma % 11);
    if (resto === 11) return '0';
    if (resto === 10) return 'K';
    return String(resto);
}

/** Formatea un cuerpo numérico como RUT chileno: 12345678 -> "12.345.678-5". */
function formatearRut(num) {
    const dv = calcularDV(num);
    const cuerpo = String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${cuerpo}-${dv}`;
}

/** Fecha relativa a hoy en días (negativo = pasado, positivo = futuro). */
function dias(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
}

const pick = (arr, i) => arr[i % arr.length];

// ─── Datos base ──────────────────────────────────────────────────────────────

const USUARIOS = [
    { email: 'admin@poto.cl', password: 'admin123' },
    { email: 'ayudante@poto.cl', password: 'ayudante123' },
    { email: 'encargado.lab@poto.cl', password: 'labpoto2024' },
    { email: 'test@poto.cl', password: 'test123', isActive: false }, // usuario desactivado para probar login bloqueado
];

// Objetos de tipo "unitario": se controlan por cantidad (stock)
const OBJETOS_UNITARIOS = [
    { nombre: 'Cable HDMI 2m', descripcion: 'Cable HDMI de 2 metros, macho-macho', categoria: 'Cables y adaptadores', stock: 8 },
    { nombre: 'Adaptador VGA a HDMI', descripcion: 'Adaptador de video VGA hembra a HDMI macho', categoria: 'Cables y adaptadores', stock: 5 },
    { nombre: 'Cable de red UTP Cat6 3m', descripcion: 'Patch cord ethernet Cat6, 3 metros', categoria: 'Cables y adaptadores', stock: 12 },
    { nombre: 'Mouse inalámbrico Logitech M170', descripcion: 'Mouse óptico inalámbrico con receptor USB', categoria: 'Periféricos', stock: 6 },
    { nombre: 'Teclado USB genérico', descripcion: 'Teclado alámbrico español latinoamericano', categoria: 'Periféricos', stock: 4 },
    { nombre: 'Control remoto proyector Epson', descripcion: 'Control de repuesto para proyectores Epson de sala', categoria: 'Accesorios A/V', stock: 3 },
    { nombre: 'Puntero láser presentador', descripcion: 'Presentador inalámbrico con puntero láser rojo', categoria: 'Accesorios A/V', stock: 2 },
    { nombre: 'Cargador universal notebook 90W', descripcion: 'Cargador con puntas intercambiables 90W', categoria: 'Energía', stock: 3 },
    { nombre: 'Regleta / zapatilla 6 tomas', descripcion: 'Regleta eléctrica con protección de 6 salidas', categoria: 'Energía', stock: 5 },
];

// Objetos de tipo "categoria": cada unidad se rastrea individualmente por código.
// El stock se deriva de la cantidad de extensiones (ver inventoryController.addItem).
const OBJETOS_CATEGORIA = [
    {
        nombre: 'Notebook Lenovo ThinkPad',
        descripcion: 'Notebooks de préstamo para ayudantías y laboratorios',
        categoria: 'Equipos de cómputo',
        extensiones: [
            { codigo: 'NB-001' },
            { codigo: 'NB-002' },
            { codigo: 'NB-003', comentario: 'Batería con autonomía reducida' },
            { codigo: 'NB-004' },
            { codigo: 'NB-005' },
        ],
    },
    {
        nombre: 'Proyector Epson PowerLite',
        descripcion: 'Proyectores portátiles para salas sin equipo fijo',
        categoria: 'Equipos A/V',
        extensiones: [
            { codigo: 'PRY-001' },
            { codigo: 'PRY-002', comentario: 'Incluye maletín de transporte' },
            { codigo: 'PRY-003' },
        ],
    },
    {
        nombre: 'Tablet Samsung Galaxy Tab A',
        descripcion: 'Tablets para toma de asistencia y encuestas en terreno',
        categoria: 'Equipos de cómputo',
        extensiones: [
            { codigo: 'TAB-001' },
            { codigo: 'TAB-002' },
            { codigo: 'TAB-003' },
            { codigo: 'TAB-004', comentario: 'Pantalla con rayón menor' },
        ],
    },
    {
        nombre: 'Arduino UNO (kit)',
        descripcion: 'Kits Arduino UNO con protoboard y componentes para talleres',
        categoria: 'Electrónica',
        extensiones: [
            { codigo: 'ARD-001' },
            { codigo: 'ARD-002' },
            { codigo: 'ARD-003' },
            { codigo: 'ARD-004' },
            { codigo: 'ARD-005' },
            { codigo: 'ARD-006' },
        ],
    },
];

// Personas mock (solicitantes de préstamos)
const PERSONAS = [
    { nombre: 'Camila Fuentes Rojas', email: 'camila.fuentes@alu.uni.cl', telefono: '+56 9 8123 4567', rutNum: 20345678 },
    { nombre: 'Matías González Pérez', email: 'matias.gonzalez@alu.uni.cl', telefono: '+56 9 7654 3210', rutNum: 19876543 },
    { nombre: 'Valentina Soto Muñoz', email: 'valentina.soto@alu.uni.cl', telefono: '+56 9 6543 2109', rutNum: 21012345 },
    { nombre: 'Benjamín Araya Díaz', email: 'benjamin.araya@alu.uni.cl', telefono: '+56 9 5432 1098', rutNum: 20567890 },
    { nombre: 'Josefa Contreras Vega', email: 'josefa.contreras@alu.uni.cl', telefono: '+56 9 4321 0987', rutNum: 19234567 },
    { nombre: 'Ignacio Morales Silva', email: 'ignacio.morales@profe.uni.cl', telefono: '+56 9 3210 9876', rutNum: 15678901 },
    { nombre: 'Antonia Reyes Castro', email: 'antonia.reyes@alu.uni.cl', telefono: '+56 9 2109 8765', rutNum: 21456789 },
    { nombre: 'Sebastián Núñez Torres', email: 'sebastian.nunez@alu.uni.cl', telefono: '+56 9 1098 7654', rutNum: 20987654 },
];

// ─── Seed ────────────────────────────────────────────────────────────────────

async function limpiar() {
    console.log('🧹 Limpiando colecciones (users, objetos, prestamos)...');
    await Promise.all([
        User.deleteMany({}),
        Objeto.deleteMany({}),
        Prestamo.deleteMany({}),
    ]);
}

async function seedUsuarios() {
    console.log('👤 Creando usuarios...');
    // Se usa .save() (no insertMany) para disparar el hook pre('save') que hashea la contraseña.
    for (const u of USUARIOS) {
        const user = new User(u);
        await user.save();
    }
    console.log(`   ${USUARIOS.length} usuarios creados.`);
    console.log('   Credenciales de acceso:');
    USUARIOS.forEach((u) =>
        console.log(`     - ${u.email} / ${u.password}${u.isActive === false ? '  (desactivado)' : ''}`)
    );
}

async function seedObjetos() {
    console.log('📦 Creando inventario...');
    const creados = [];

    for (const o of OBJETOS_UNITARIOS) {
        const doc = await Objeto.create({ ...o, tipo: 'unitario', extensiones: [] });
        creados.push(doc);
    }

    for (const o of OBJETOS_CATEGORIA) {
        const extensiones = o.extensiones.map((e) => ({
            codigo: e.codigo,
            disponible: true,
            comentario: e.comentario || '',
        }));
        const doc = await Objeto.create({
            nombre: o.nombre,
            descripcion: o.descripcion,
            categoria: o.categoria,
            tipo: 'categoria',
            stock: extensiones.length, // stock derivado de la cantidad de extensiones
            extensiones,
        });
        creados.push(doc);
    }

    console.log(`   ${creados.length} objetos creados (${OBJETOS_UNITARIOS.length} unitarios, ${OBJETOS_CATEGORIA.length} categorías).`);
    return creados;
}

/**
 * Crea un préstamo replicando la lógica de prestamoController.addPrestamo:
 * ajusta stock (unitario) o marca la extensión no disponible (categoria)
 * solo cuando el préstamo queda ACTIVO (finalizado = false).
 */
async function crearPrestamo({ persona, objeto, tipo_prestamo, extension_codigo, offsetInicio, finalizado, comentario }) {
    const esCategoria = objeto.tipo === 'categoria';

    // Ajuste de inventario solo si el préstamo está activo
    if (!finalizado) {
        if (esCategoria) {
            const ext = objeto.extensiones.find((e) => e.codigo === extension_codigo);
            if (!ext || !ext.disponible) {
                throw new Error(`Extensión ${extension_codigo} de "${objeto.nombre}" no disponible para seed`);
            }
            ext.disponible = false;
            await objeto.save();
        } else {
            if (objeto.stock < 1) {
                throw new Error(`Sin stock de "${objeto.nombre}" para seed`);
            }
            objeto.stock -= 1;
            await objeto.save();
        }
    }

    const especial = tipo_prestamo === 'especial';

    const prestamo = new Prestamo({
        rut: formatearRut(persona.rutNum),
        nombre: persona.nombre,
        email: persona.email,
        telefono: especial ? persona.telefono : undefined,
        id_producto: objeto._id,
        nombre_producto: objeto.nombre,
        tipo_prestamo,
        extension_codigo: esCategoria ? extension_codigo : undefined,
        // los préstamos especiales llevan fecha de devolución esperada
        fecha_devolucion_esperada: especial ? dias(offsetInicio + 7) : undefined,
        finalizado: !!finalizado,
        comentario: comentario || undefined,
    });

    // createdAt controlado para simular historial (algunos préstamos antiguos)
    const doc = await prestamo.save();
    if (offsetInicio !== 0) {
        await Prestamo.updateOne({ _id: doc._id }, { $set: { createdAt: dias(offsetInicio) } });
    }
    return doc;
}

async function seedPrestamos(objetos) {
    console.log('🔁 Creando préstamos...');

    const byNombre = (n) => objetos.find((o) => o.nombre === n);

    const notebooks = byNombre('Notebook Lenovo ThinkPad');
    const proyectores = byNombre('Proyector Epson PowerLite');
    const tablets = byNombre('Tablet Samsung Galaxy Tab A');
    const arduinos = byNombre('Arduino UNO (kit)');
    const cableHdmi = byNombre('Cable HDMI 2m');
    const mouse = byNombre('Mouse inalámbrico Logitech M170');
    const cargador = byNombre('Cargador universal notebook 90W');
    const puntero = byNombre('Puntero láser presentador');

    let creados = 0;

    // Config declarativa de préstamos a crear.
    const plan = [
        // ── Préstamos ACTIVOS (pendientes) ─────────────────────────────
        // Categoría: marcan extensión como ocupada
        { p: 0, objeto: notebooks, tipo: 'especial', ext: 'NB-001', offset: -3, fin: false, comentario: 'Para ayudantía de Programación Avanzada' },
        { p: 1, objeto: notebooks, tipo: 'especial', ext: 'NB-004', offset: -1, fin: false },
        { p: 2, objeto: proyectores, tipo: 'especial', ext: 'PRY-002', offset: -2, fin: false, comentario: 'Charla de titulación sala B-201' },
        { p: 3, objeto: tablets, tipo: 'publico', ext: 'TAB-001', offset: 0, fin: false },
        { p: 4, objeto: arduinos, tipo: 'especial', ext: 'ARD-002', offset: -5, fin: false, comentario: 'Taller de robótica' },
        { p: 7, objeto: arduinos, tipo: 'publico', ext: 'ARD-003', offset: 0, fin: false },

        // Unitario: descuentan stock
        { p: 5, objeto: cableHdmi, tipo: 'publico', offset: 0, fin: false },
        { p: 6, objeto: cableHdmi, tipo: 'publico', offset: 0, fin: false },
        { p: 0, objeto: mouse, tipo: 'publico', offset: -1, fin: false },
        { p: 3, objeto: cargador, tipo: 'especial', offset: -4, fin: false, comentario: 'Cargador extraviado por el alumno, en seguimiento' },

        // ── Préstamo ESPECIAL activo VENCIDO (fecha de devolución ya pasó) ──
        { p: 1, objeto: proyectores, tipo: 'especial', ext: 'PRY-001', offset: -20, fin: false, comentario: 'ATRASADO: no ha devuelto el proyector' },

        // ── Préstamos FINALIZADOS (historial; no afectan stock actual) ─────
        { p: 2, objeto: notebooks, tipo: 'especial', ext: 'NB-002', offset: -30, fin: true },
        { p: 4, objeto: tablets, tipo: 'publico', ext: 'TAB-003', offset: -25, fin: true },
        { p: 6, objeto: cableHdmi, tipo: 'publico', offset: -15, fin: true },
        { p: 5, objeto: puntero, tipo: 'especial', offset: -40, fin: true, comentario: 'Devuelto en buen estado' },
        { p: 0, objeto: arduinos, tipo: 'publico', ext: 'ARD-001', offset: -12, fin: true },
    ];

    for (const item of plan) {
        try {
            await crearPrestamo({
                persona: pick(PERSONAS, item.p),
                objeto: item.objeto,
                tipo_prestamo: item.tipo,
                extension_codigo: item.ext,
                offsetInicio: item.offset,
                finalizado: item.fin,
                comentario: item.comentario,
            });
            creados++;
        } catch (err) {
            console.warn(`   ⚠️  Se omitió un préstamo: ${err.message}`);
        }
    }

    console.log(`   ${creados} préstamos creados.`);
}

async function resumen() {
    const [nUsers, nObjetos, nPrestamos, nPendientes, nEspecialesPend] = await Promise.all([
        User.countDocuments(),
        Objeto.countDocuments(),
        Prestamo.countDocuments(),
        Prestamo.countDocuments({ finalizado: false }),
        Prestamo.countDocuments({ finalizado: false, tipo_prestamo: 'especial' }),
    ]);

    console.log('\n📊 Resumen en base de datos:');
    console.log(`   Usuarios:              ${nUsers}`);
    console.log(`   Objetos (inventario):  ${nObjetos}`);
    console.log(`   Préstamos totales:     ${nPrestamos}`);
    console.log(`   Préstamos pendientes:  ${nPendientes}`);
    console.log(`   Especiales pendientes: ${nEspecialesPend}`);
}

async function run() {
    console.log(`\n🌱 Seed POTO → ${URI}\n`);
    await mongoose.connect(URI);

    if (WIPE_ONLY) {
        await limpiar();
        console.log('✅ Colecciones limpiadas.');
        return;
    }

    if (!KEEP) {
        await limpiar();
    } else {
        console.log('ℹ️  Modo --keep: no se borran datos existentes, solo se agregan mock.');
    }

    await seedUsuarios();
    const objetos = await seedObjetos();
    await seedPrestamos(objetos);
    await resumen();

    console.log('\n✅ Seed completado.\n');
}

run()
    .catch((err) => {
        console.error('\n❌ Error durante el seed:', err);
        process.exitCode = 1;
    })
    .finally(() => mongoose.connection.close());
