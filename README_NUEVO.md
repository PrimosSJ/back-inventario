# POTO — Backend

API REST + servidor Socket.io de **POTO** (*Plataforma Optimizada de Trazabilidad y Organización*), el sistema de inventario y préstamo de equipamiento de los laboratorios del departamento de informática.

Construido con **Node.js + Express 4 + MongoDB (Mongoose 8)**. Expone tres grupos de rutas (`/auth`, `/inventario`, `/prestamos`) que consume el frontend.

> Para el panorama completo del sistema — arquitectura, modelos y estado del proyecto —> ver [ESTADO_PROYECTO.md](../ESTADO_PROYECTO.md).
> Para la migración de datos legacy y la restauración de backups, el [README.md](README.md) original sigue vigente.

---

## Stack

Extraído de [package.json](package.json).

| Librería | Versión | Rol |
|---|---|---|
| `express` | ^4.19.2 | Framework HTTP y router |
| `mongoose` | ^8.4.4 | ODM de MongoDB: schemas `Objeto`, `Prestamo`, `User` |
| `socket.io` | ^4.7.5 | Servidor WebSocket |
| `jsonwebtoken` | ^9.0.2 | Firma y verificación de JWT (expiran en 24h) |
| `bcryptjs` | ^3.0.2 | Hash de contraseñas (12 rondas de salt) |
| `cors` | ^2.8.5 | CORS — actualmente `origin: '*'` |
| `dotenv` | ^16.4.5 | Carga del archivo `.env` |

El proyecto usa **ESM** (`"type": "module"`): `import`/`export`, no `require`.

> ⚠️ **No hay dependencias de desarrollo.** No hay `nodemon` (cada cambio exige reiniciar a mano), ni linter, ni framework de tests. El script `test` es el placeholder que falla a propósito.

---

## Requisitos previos

- **Node.js 20 o superior** — es la versión del [Dockerfile](Dockerfile) (`node:20-alpine`).
- **MongoDB 6.0**, ya sea vía Docker (recomendado, incluido en el compose) o instalado localmente.
- **Docker + Docker Compose** si vas a usar el compose o el script de backup.

---

## Instalación

```bash
cd back-inventario
npm install
```

---

## Variables de entorno

**No existe un `.env.example` en el repositorio.** La tabla siguiente sale de las apariciones reales de `process.env` en el código (el uso del .env es solo si no se corre con Docker).

| Variable | Requerida | Default | Dónde se usa |
|---|---|---|---|
| `MONGO_DB_URI` | **Sí** | ninguno | [server.js:32](server.js#L32), `scripts/migrate.js`, `scripts/seed.js` |
| `JWT_SECRET` | **Sí** | ninguno | [controllers/authController.js:4](controllers/authController.js#L4) |
| `PORT` | No | `4000` | [server.js:54](server.js#L54) |
| `NODE_ENV` | No | ninguno | `scripts/seed.js` — bloquea el seed si vale `production` |

Crear `back-inventario/.env`:

```env
PORT=4000
MONGO_DB_URI=mongodb://localhost:27017/mydatabase
JWT_SECRET=cambia_esto_por_un_secreto_largo_y_aleatorio
NODE_ENV=development
```

Si el backend corre en Docker junto al Mongo del compose, el host es el nombre del servicio:

```env
MONGO_DB_URI=mongodb://mongo:27017/mydatabase
```

`.env` está en el [.gitignore](.gitignore) — no se versiona.


## Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm start` | Arranca el servidor (`node server.js`) |
| `npm run seed` | Carga datos de prueba (`node scripts/seed.js`) |
| `npm test` | ⚠️ Placeholder: falla a propósito, no hay tests |

Al arrancar correctamente:

```
Conectado a la BD del POTO
Server running on port 4000
```

⚠️ **No hay script `dev` ni `nodemon`**: cada cambio en el código exige reiniciar el proceso.

⚠️ **No hay script `migrate`** aunque el [README.md](README.md) documenta la migración. Hay que invocarla directamente: `node scripts/migrate.js`.

---

## API

**Base URL:** `http://localhost:4000` (o el valor de `PORT`)
**Content-Type:** `application/json` en todos los endpoints.

### ⚠️ Estado de la autenticación

**Solo `GET /auth/verify-token` aplica el middleware `verifyToken`.** Los endpoints de `/inventario` y `/prestamos` — incluyendo los `DELETE` — **responden a cualquier petición**, con o sin token. Combinado con `cors({ origin: '*' })`, cualquiera con acceso de red al puerto 4000 puede leer y modificar todo el inventario.

La protección hoy es **puramente de interfaz**: el frontend envía el token en cada request y bloquea la UI sin sesión, pero el servidor no lo exige. Cerrarlo es agregar `verifyToken` a los routers de inventario y préstamos.

---

## Endpoints — `/auth`

Definidos en [routes/auth.js](routes/auth.js), implementados en [controllers/authController.js](controllers/authController.js).

### `POST /auth/register`

Crea un usuario. ⚠️ **No requiere autenticación**: cualquiera con acceso al backend puede crearse una cuenta válida.

**Body**

```json
{ "email": "ayudante@poto.cl", "password": "unaClaveSegura" }
```

`password` debe tener al menos 6 caracteres (validación del schema). El email se normaliza a minúsculas y se valida contra un regex.

**Respuestas**

| Código | Cuerpo |
|---|---|
| `201` | `{ "success": true, "message": "Usuario registrado exitosamente", "user": { ... } }` |
| `400` | `{ "success": false, "message": "Email y contraseña son requeridos" }` |
| `409` | `{ "success": false, "message": "El usuario ya existe" }` |
| `500` | `{ "success": false, "message": "Error del servidor" }` |

El objeto `user` **nunca incluye `password`** (lo elimina el `toJSON()` del modelo).

**Ejemplo** — hoy es la única forma de crear usuarios, porque el frontend no expone registro:

```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"nuevo@poto.cl","password":"clave123"}'
```

### `POST /auth/login`

Autentica y devuelve un JWT.

**Body**

```json
{ "email": "ayudante@poto.cl", "password": "unaClaveSegura" }
```

**Respuestas**

| Código | Cuerpo |
|---|---|
| `200` | `{ "success": true, "message": "Autenticación exitosa", "token": "eyJ...", "user": { ... } }` |
| `400` | `{ "success": false, "message": "Email y contraseña son requeridos" }` |
| `401` | `"Usuario no encontrado"` \| `"Usuario desactivado."` \| `"Credenciales incorrectas"` |
| `500` | `{ "success": false, "message": "Error del servidor" }` |

El token se firma con `JWT_SECRET`, lleva payload `{ id, email }` y **expira en 24 horas**.

⚠️ La respuesta distingue "usuario no encontrado" de "credenciales incorrectas", lo que permite enumerar qué correos existen en el sistema.

### `GET /auth/verify-token`

Valida el token del header. **Es el único endpoint protegido.**

**Headers**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Respuestas**

| Código | Cuerpo |
|---|---|
| `200` | `{ "success": true, "message": "Token válido", "user": { "id": "...", "email": "..." } }` |
| `401` | `"Token no proporcionado"` \| `"Token expirado"` \| `"Token inválido"` \| `"Usuario no encontrado"` |
| `500` | `{ "success": false, "message": "Error del servidor" }` |

También rechaza tokens válidos cuyo usuario tenga `isActive: false`.

> ⚠️ El controlador exporta además una función **`getProfile`**, pero **ninguna ruta la monta**. Es código sin uso ([authController.js:167-188](controllers/authController.js#L167-L188)).

---

## Endpoints — `/inventario`

Definidos en [routes/inventoryRoutes.js](routes/inventoryRoutes.js), implementados en [controllers/inventoryController.js](controllers/inventoryController.js).

### `GET /inventario`

Devuelve **todos** los items. Sin paginación ni filtros — el filtrado ocurre en el cliente.

**Respuesta `200`**

```json
[
  {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "nombre": "Notebook Lenovo ThinkPad",
    "descripcion": "Notebooks de préstamo para ayudantías",
    "categoria": "Equipos de cómputo",
    "stock": 5,
    "tipo": "categoria",
    "extensiones": [
      { "codigo": "NB-001", "disponible": true,  "comentario": "" },
      { "codigo": "NB-002", "disponible": false, "comentario": "Batería con autonomía reducida" }
    ],
    "createdAt": "2026-06-10T14:00:00.000Z",
    "updatedAt": "2026-08-01T09:30:00.000Z"
  }
]
```

### `POST /inventario`

Crea un item. El comportamiento depende de `tipo`.

**Body — item unitario**

```json
{
  "nombre": "Cable HDMI 2m",
  "descripcion": "Cable HDMI macho-macho",
  "categoria": "Cables y adaptadores",
  "tipo": "unitario",
  "stock": 8
}
```

**Body — item de tipo categoría**

```json
{
  "nombre": "Notebook Lenovo ThinkPad",
  "descripcion": "Notebooks de préstamo",
  "categoria": "Equipos de cómputo",
  "tipo": "categoria",
  "extensiones": [
    { "codigo": "NB-001" },
    { "codigo": "NB-002", "comentario": "Sin cargador" }
  ]
}
```

Reglas aplicadas por el controlador:

- Si `tipo` no viene, se asume `"unitario"`.
- **`tipo: "categoria"`** — `extensiones` debe ser un array **no vacío** y los `codigo` deben ser  únicos entre sí. `stock` se **ignora** y se fija en `extensiones.length`. Cada extensión se   normaliza a `{ codigo, disponible (default true), comentario (default "") }`.
- **`tipo: "unitario"`** — `stock` se parsea a entero y no puede ser negativo.

**Respuestas**

| Código | Cuerpo |
|---|---|
| `201` | El objeto creado completo |
| `400` | `"Una categoría debe tener al menos una extensión"` \| `"Los códigos de las extensiones deben ser únicos"` \| `"El stock no puede ser negativo"` \| error de validación de Mongoose |

### `POST /inventario/bulk`

Importación masiva (la usa el import de Excel del frontend). Procesa **fila por fila**: un error en una no aborta las demás.

**Body**

```json
{
  "items": [
    { "nombre": "Cable HDMI 2m", "descripcion": "...", "categoria": "Cables", "tipo": "unitario", "stock": 8 },
    { "nombre": "Mouse Logitech",  "descripcion": "...", "categoria": "Periféricos", "stock": 6 }
  ]
}
```

**Respuesta `207` (Multi-Status)** — siempre `207`, incluso si todo salió bien:

```json
{
  "total": 2,
  "creados": 1,
  "errores": 1,
  "detalle_errores": [
    { "fila": 2, "nombre": "Mouse Logitech", "error": "Objeto validation failed: descripcion: Path `descripcion` is required." }
  ]
}
```

**Respuesta `400`** si `items` no es un array o viene vacío.

> ⚠️ **Este endpoint no puede crear extensiones.** Fuerza `extensiones: []` y, si la fila declara `tipo: "categoria"`, le pone `stock: 0` ([inventoryController.js:213-220](controllers/inventoryController.js#L213-L220)). Una categoría importada queda como cascarón vacío que hay que completar después desde la edición. Para items unitarios la importación funciona completa.

### `GET /inventario/categorias`

Lista las categorías distintas presentes en la colección (un `distinct` sobre el campo `categoria`). Alimenta el `<select>` de categorías del frontend.

**Respuesta `200`**

```json
["Cables y adaptadores", "Equipos de cómputo", "Periféricos", "Energía"]
```

### `GET /inventario/:id`

Devuelve un item por su `_id`.

| Código | Cuerpo |
|---|---|
| `200` | El objeto, **o `null`** si el id no existe |
| `500` | `{ "message": "..." }` si el id tiene formato inválido (`CastError`) |

> ⚠️ Un id con formato válido que no existe devuelve **`200` con cuerpo `null`**, no `404`. El frontend lo compensa comprobando `if (!res.data || !res.data._id)`.

### `PUT /inventario/:id`

Actualiza un item. **Todos los campos son opcionales** — solo se aplican los presentes en el body.

**Body (ejemplo parcial)**

```json
{ "nombre": "Notebook Lenovo ThinkPad T480", "stock": 10 }
```

Reglas:

- Si `tipo` no viene en el body, el controlador **lee el tipo actual desde la base** para decidir  cómo procesar el resto.
- **Tipo final `categoria`** — si viene `extensiones`, se revalida (no vacío, códigos únicos) y  `stock` se recalcula como `extensiones.length`. Si no viene, las extensiones quedan intactas.
- **Tipo final `unitario`** — se valida `stock`. Además, si el body incluye explícitamente  `tipo: "unitario"`, se **vacía el array `extensiones`**.

| Código | Cuerpo |
|---|---|
| `200` | El objeto actualizado (`{ new: true }`) |
| `400` | Errores de validación de extensiones o stock |
| `500` | Error de servidor |

### `DELETE /inventario/:id`

Elimina un item.

| Código | Cuerpo |
|---|---|
| `200` | `{ "message": "Objeto eliminado" }` |
| `500` | `{ "message": "..." }` |

> ⚠️ **Borrado sin restricciones.** No verifica que existan préstamos activos de ese item, y devuelve `200` aunque el id no exista. Los préstamos históricos siguen siendo legibles porque guardan `nombre_producto` copiado, pero quedan apuntando a un `id_producto` inexistente.

### `GET /inventario/:id/extensiones`

Todas las extensiones de un item de tipo categoría, disponibles u ocupadas.

| Código | Cuerpo |
|---|---|
| `200` | Array de `{ codigo, disponible, comentario }` |
| `400` | `{ "message": "El objeto no es de tipo categoría" }` |
| `404` | `{ "message": "Objeto no encontrado" }` |

> Nota: el frontend actual **no consume este endpoint** — solo usa el de disponibles.

### `GET /inventario/:id/extensiones-disponibles`

Igual que el anterior, pero filtrado a `disponible: true`. Es el que alimenta el `<select>` de extensiones del formulario de préstamo.

| Código | Cuerpo |
|---|---|
| `200` | Array de extensiones libres (puede ser `[]`) |
| `400` | `{ "message": "El objeto no es de tipo categoría" }` |
| `404` | `{ "message": "Objeto no encontrado" }` |

### `PATCH /inventario/:id/extensiones/:codigo/comentario`

Actualiza el comentario de **una** extensión concreta, con un `$set` posicional. Sirve para anotar el estado real de esa unidad: *"Batería con autonomía reducida"*, *"Pantalla con rayón menor"*.

**Body**

```json
{ "comentario": "Batería con autonomía reducida" }
```

Si `comentario` viene vacío o ausente, se guarda `""` (esa es la forma de borrarlo).

| Código | Cuerpo |
|---|---|
| `200` | El objeto **completo** actualizado |
| `404` | `{ "message": "Item o extensión no encontrado" }` |

**Ejemplo**

```bash
curl -X PATCH http://localhost:4000/inventario/665f.../extensiones/NB-002/comentario \
  -H "Content-Type: application/json" \
  -d '{"comentario":"Batería con autonomía reducida"}'
```

---

## Endpoints — `/prestamos`

Definidos en [routes/prestamosRoutes.js](routes/prestamosRoutes.js), implementados en [controllers/prestamoController.js](controllers/prestamoController.js).

### `GET /prestamos`

Todos los préstamos, activos e históricos. Sin paginación ni filtros — el frontend filtra en cliente.

**Respuesta `200`**

```json
[
  {
    "_id": "665f9a8b7c6d5e4f3a2b1c0d",
    "rut": "20345678",
    "nombre": "Camila Fuentes Rojas",
    "email": "camila.fuentes@alu.uni.cl",
    "telefono": "+56 9 8123 4567",
    "id_producto": "665f1a2b3c4d5e6f7a8b9c0d",
    "nombre_producto": "Notebook Lenovo ThinkPad",
    "tipo_prestamo": "especial",
    "extension_codigo": "NB-001",
    "fecha_devolucion_esperada": "2026-08-10T00:00:00.000Z",
    "finalizado": false,
    "comentario": "Para ayudantía de Programación Avanzada",
    "createdAt": "2026-08-01T14:22:00.000Z",
    "updatedAt": "2026-08-01T14:22:00.000Z"
  }
]
```

### `POST /prestamos`

Crea un préstamo **y descuenta el inventario** en la misma operación.

**Body — préstamo público de item unitario**

```json
{
  "rut": "20345678",
  "nombre": "Camila Fuentes Rojas",
  "email": "camila.fuentes@alu.uni.cl",
  "id_producto": "665f1a2b3c4d5e6f7a8b9c0d",
  "tipo_prestamo": "publico",
  "comentario": "Opcional"
}
```

**Body — préstamo especial de una extensión**

```json
{
  "rut": "20345678",
  "nombre": "Camila Fuentes Rojas",
  "email": "camila.fuentes@alu.uni.cl",
  "telefono": "+56 9 8123 4567",
  "id_producto": "665f1a2b3c4d5e6f7a8b9c0d",
  "tipo_prestamo": "especial",
  "extension_codigo": "NB-001",
  "fecha_devolucion_esperada": "2026-08-10",
  "comentario": "Charla de titulación sala B-201"
}
```

**Campos**

| Campo | Obligatorio | Nota |
|---|---|---|
| `rut` | Sí | Se guarda **tal cual llega**, sin normalizar |
| `nombre` | Sí | |
| `email` | Sí | |
| `id_producto` | Sí | `_id` del item |
| `tipo_prestamo` | No | `"publico"` \| `"especial"`. Si falta, se asume `"publico"` |
| `telefono` | Solo en especiales | |
| `fecha_devolucion_esperada` | Solo en especiales | |
| `extension_codigo` | Solo si el producto es `tipo: "categoria"` | |
| `comentario` | No | |

**Efectos secundarios sobre el inventario**

- Producto `unitario` → verifica `stock >= 1` y hace `stock--`.
- Producto `categoria` → verifica que la extensión exista y esté disponible, y la marca  `disponible: false`.

`nombre_producto` se copia del item en el momento del préstamo, de modo que el historial siga siendo legible aunque el producto se renombre o se elimine.

**Respuestas**

| Código | Cuerpo |
|---|---|
| `201` | El préstamo creado |
| `400` | `"Faltan campos obligatorios"` \| `"Tipo de préstamo inválido"` \| `"Teléfono y fecha de devolución esperada son obligatorios para préstamos especiales"` \| `"Debe especificar la extensión a prestar para un producto de tipo categoría"` \| `"La extensión no está disponible"` \| `"Producto no disponible"` |
| `404` | `"Producto no encontrado"` \| `"Extensión no encontrada"` |

> ⚠️ **No es una operación atómica.** El descuento del inventario se persiste **antes** de crear el préstamo. Si la creación del préstamo falla después de eso, el stock queda descontado sin préstamo asociado. Es poco probable a la escala de un laboratorio, pero conviene saberlo.

### `GET /prestamos/pendientes`

Préstamos con `finalizado: false`.

| Código | Cuerpo |
|---|---|
| `200` | Array de préstamos (puede ser `[]`) |
| `500` | Error |

> Nota: el frontend actual **no consume este endpoint**; obtiene todo con `GET /prestamos` y filtra en cliente.

### `GET /prestamos/pendientes-especiales`

Préstamos con `finalizado: false`, `tipo_prestamo: "especial"` y `fecha_devolucion_esperada` existente y no nula. Es el que usa `AlertasDevoluciones` para decidir a quién mandar recordatorio.

| Código | Cuerpo |
|---|---|
| `200` | Array de préstamos (puede ser `[]`) |
| `500` | Error |

### `GET /prestamos/:id`

Un préstamo por su `_id`.

| Código | Cuerpo |
|---|---|
| `200` | El préstamo |
| `404` | `{ "message": "Prestamo no encontrado" }` |
| `500` | Error |

### `GET /prestamos/history/:rut`

Todos los préstamos de un RUT, activos e históricos. Alimenta la página de historial.

**Ejemplo**

```bash
curl http://localhost:4000/prestamos/history/20345678
```

| Código | Cuerpo |
|---|---|
| `200` | Array de préstamos (puede ser `[]`) |
| `500` | Error |

> ⚠️ **Coincidencia exacta de string**: `Prestamo.find({ rut: req.params.rut })`, sin normalización. Un RUT guardado como `20.345.678-5` **no** se encuentra buscando `20345678`. Como el frontend envía dígitos sin puntos pero el `seed.js` guarda RUTs formateados, es fácil toparse con historiales vacíos que sí tienen datos. La solución de fondo es normalizar el RUT al guardar y al buscar.

### `PATCH /prestamos/return/:id`

Marca un préstamo como devuelto y **restituye el inventario**.

Sin body.

**Qué hace, en orden:**

1. Verifica que el préstamo exista y no esté ya finalizado.
2. Marca `finalizado: true` con `updateOne` + `$set`.
3. En un `try/catch` **separado**, restituye el inventario: si el préstamo tiene
   `extension_codigo`, marca esa extensión `disponible: true`; si no, hace `stock++`.

| Código | Cuerpo |
|---|---|
| `200` | El préstamo con `finalizado: true` |
| `400` | `{ "message": "Prestamo ya finalizado" }` |
| `404` | `{ "message": "Prestamo no encontrado" }` |
| `500` | Error |

**Por qué está escrito así** — los dos detalles del paso 2 y 3 son deliberados y están comentados en el código:

- Usa `updateOne` + `$set` en vez de `save()` para **saltarse la validación de Mongoose**, porque   existen préstamos anteriores a los que les faltan campos hoy obligatorios (`tipo_prestamo`,  `nombre_producto`) y fallarían al guardar.
- La restitución del inventario va en su propio `try/catch` para que **un producto borrado nunca   impida marcar el préstamo como devuelto**. Si el producto no existe, solo se escribe un warning  en el log.

**Ejemplo**

```bash
curl -X PATCH http://localhost:4000/prestamos/return/665f9a8b7c6d5e4f3a2b1c0d
```

---

## Socket.io

El servidor levanta socket.io sobre el mismo puerto HTTP, acepta cualquier origen y expone la instancia a todas las rutas mediante un middleware ([server.js:38-41](server.js#L38-L41)):

```js
app.use((req, res, next) => {
    req.io = io;
    next();
});
```

Al conectarse o desconectarse un cliente, lo registra en consola.

> ⚠️ **Ningún controlador emite eventos.** Búsqueda en todo el backend: la única aparición de `io` fuera de `server.js` es la asignación `req.io = io`. **No hay un solo `req.io.emit(...)`.**
>
> El frontend, en cambio, **sí escucha** dos eventos: `inventoryUpdate` y `prestamosUpdate`. Consecuencia: dos ayudantes trabajando en paralelo no ven los cambios del otro sin recargar.
>
> Para cerrarlo, hay que emitir tras cada mutación. Por ejemplo, en `addPrestamo`, después de guardar:
>
> ```js
> req.io.emit('prestamosUpdate', newPrestamo);
> ```
>
> y en las mutaciones de inventario, `req.io.emit('inventoryUpdate', await Objeto.find())` — el hook `useInventoryData` espera el **array completo** en ese evento, mientras que `useLoans` espera **un solo préstamo** en `prestamosUpdate`. Conviene respetar esos formatos.

---

## Estructura de carpetas

```
back-inventario/
├── server.js                  Punto de entrada
├── package.json               type: module (ESM)
├── Dockerfile                 node:20-alpine, expone 4000
├── docker-compose.yml         backend + mongo con volumen persistente
├── .dockerignore
│
├── models/                    Schemas de Mongoose
│   ├── inventario.js          Objeto + extensionSchema embebido
│   ├── prestamo.js            Prestamo
│   └── User.js                User + bcrypt + comparePassword + toJSON
│
├── routes/                    Solo definición de rutas, sin lógica
│   ├── inventoryRoutes.js     10 rutas bajo /inventario
│   ├── prestamosRoutes.js     7 rutas bajo /prestamos
│   └── auth.js                3 rutas bajo /auth
│
├── controllers/               Lógica de negocio
│   ├── inventoryController.js CRUD + extensiones + bulk
│   ├── prestamoController.js  Préstamos, devolución, consultas
│   └── authController.js      login, register, verifyToken, getProfile (sin ruta)
│
├── scripts/                   Utilidades operacionales
│   ├── seed.js                Datos de prueba
│   ├── migrate.js             Migración de documentos legacy
│   └── backup.sh              Dump de MongoDB
│
└── data/mongo/                ⚠️ Datos locales de WiredTiger. Ignorado por git
```

**`server.js`** — configura CORS, crea el servidor HTTP y el de socket.io, conecta a MongoDB, aplica `express.json()`, inyecta `req.io` y monta los tres routers.

**`models/`** — Los tres schemas usan `{ timestamps: true }`, o sea que Mongoose mantiene `createdAt` y `updatedAt`. Detalle campo por campo en [ESTADO_PROYECTO.md](../ESTADO_PROYECTO.md) § 5.

**`routes/`** — El orden de declaración importa: las rutas literales (`/categorias`, `/pendientes`) van **antes** que las paramétricas (`/:id`) para que Express no interprete "categorias" como un id.

**`controllers/`** — Todos los handlers están envueltos en `try/catch` con `console.error` y respuesta de error explícita.

**`data/mongo/`** — Archivos de WiredTiger de un Mongo corrido localmente. Está en el `.gitignore` (entrada `data`) y no debe versionarse.

---

## Scripts operacionales

### `scripts/seed.js` — datos de prueba

```bash
npm run seed                    # limpia las colecciones y reinserta
node scripts/seed.js --keep     # agrega sin borrar lo existente
node scripts/seed.js --wipe     # solo limpia y termina
```

Genera:

- **4 usuarios** con contraseñas conocidas (uno desactivado, para probar el login bloqueado).
- **13 items**: 9 unitarios (cables, mouse, teclado, cargadores…) y 4 categorías con extensiones  (notebooks `NB-00x`, proyectores `PRY-00x`, tablets `TAB-00x`, kits Arduino `ARD-00x`), algunas con  comentarios realistas.
- **16 préstamos** en distintos estados: activos, uno especial **vencido**, y finalizados con   `createdAt` retrocedido para simular historial.

| Email | Contraseña | Nota |
|---|---|---|
| `admin@poto.cl` | `admin123` | |
| `ayudante@poto.cl` | `ayudante123` | |
| `encargado.lab@poto.cl` | `labpoto2024` | |
| `test@poto.cl` | `test123` | `isActive: false` |

El script **respeta la lógica de negocio de los controladores**: los préstamos activos descuentan stock o marcan extensiones ocupadas; los finalizados no. Usa `save()` en vez de `insertMany` para que se dispare el hook que hashea las contraseñas.

**Protección:** se niega a correr si `NODE_ENV=production`.

Si `MONGO_DB_URI` no empieza con `mongodb`, cae a `mongodb://localhost:27017/mydatabase`.

### `scripts/migrate.js` — migración de datos legacy

```bash
node scripts/migrate.js
```

⚠️ **No hay script npm para esto**; hay que invocarlo directamente.

Adapta documentos creados con el modelo anterior. Sobre `objetos`: asigna `tipo: "unitario"`, `tipo_prestamo: "publico"` y `extensiones: []` a los que no los tengan, y elimina los campos `precio` y `timestamp`. Sobre `prestamos`: asigna `tipo_prestamo: "publico"` y `email: ""` donde falten, y elimina `monto` y `timestamp`.

Todas las operaciones usan `$exists` como condición, así que es **idempotente**: correrlo dos veces no hace daño. Aun así, **haz backup antes**.

Detalle completo en el [README.md](README.md) original.

### `scripts/backup.sh` — respaldo de MongoDB

```bash
chmod +x scripts/backup.sh
./scripts/backup.sh
```

Requiere que el contenedor `primos-poto-bd` esté corriendo. Ejecuta `mongodump` dentro del contenedor, copia el resultado al host en `backups/backup_YYYY-MM-DD_HH-MM/` y limpia el temporal. La carpeta `backups/` está en el `.gitignore`.

**Restaurar** (los nombres de contenedor y base están fijos en el script: `primos-poto-bd`,
`mydatabase`):

```bash
docker cp backups/backup_2026-08-03_11-15/mydatabase primos-poto-bd:/tmp/restore
docker exec primos-poto-bd mongorestore --db mydatabase --drop /tmp/restore
docker exec primos-poto-bd rm -rf /tmp/restore
```

⚠️ `--drop` **elimina los datos actuales** antes de restaurar.

Es un script bash: en Windows necesita Git Bash o WSL.

---

## Despliegue con Docker

[docker-compose.yml](docker-compose.yml) levanta dos servicios:

| Servicio | Contenedor | Puerto | Detalle |
|---|---|---|---|
| `backend` | `primos-poto-backend` | `4000:4000` | Build desde el Dockerfile local, `restart: unless-stopped` |
| `mongo` | `primos-poto-bd` | `27017:27017` | Imagen `mongo:6.0`, volumen persistente `mongo-data` |

```bash
cd back-inventario
docker compose up --build -d      # levantar
docker compose logs -f backend    # ver logs
docker compose down               # bajar (el volumen mongo-data se conserva)
docker compose down -v            # bajar Y BORRAR los datos
```

`backend` declara `depends_on: mongo`, lo que garantiza el **orden de arranque** pero no que Mongo esté listo para aceptar conexiones. Si el backend arranca primero, imprime `Error al conectar a la BD` — normalmente basta con `docker compose restart backend`.

El servicio monta el código con `volumes: [".:/app", "/app/node_modules"]`, así que los cambios en archivos se reflejan en el contenedor. Aun así **hay que reiniciarlo** para que tomen efecto: no hay nodemon.

### Antes de un despliegue real

⚠️ **Cambia el `JWT_SECRET`.** El compose trae `JWT_SECRET=your_jwt_secret` hardcodeado en el archivo versionado. Muévelo a un `.env` o a los secretos del entorno.

⚠️ **`NODE_ENV=development`** también viene fijo en el compose. Cambiarlo a `production` además activa la protección del seed.

⚠️ **CORS abierto.** `origin: '*'` acepta peticiones desde cualquier dominio. En producción conviene restringirlo al origen real del frontend.

⚠️ **Endpoints sin autenticación.** Ver la advertencia al inicio de la sección de API — es el punto más importante a resolver antes de exponer el servicio fuera de la red del laboratorio.

⚠️ **MongoDB expuesto en el puerto 27017** sin autenticación configurada. Si el host es alcanzable desde fuera, la base queda accesible directamente.

---

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| `Error al conectar a la BD` pero el servidor sigue arriba | `MONGO_DB_URI` sin definir o mal, o Mongo aún no está listo |
| `POST /auth/login` devuelve `500` | `JWT_SECRET` sin definir en el `.env` |
| Todos los endpoints fallan con error de base de datos | La conexión a Mongo nunca se estableció — revisa los logs del arranque |
| `GET /inventario/:id` devuelve `null` con código `200` | Comportamiento conocido: `findById` de un id inexistente no da `404` |
| El historial por RUT sale vacío | Formato del RUT distinto al almacenado — la búsqueda es exacta |
| Los cambios no se propagan entre sesiones | Esperado: socket.io no emite eventos |
| Una categoría importada por Excel quedó sin extensiones | Comportamiento conocido de `bulk`: hay que agregarlas desde la edición |
| Los cambios en el código no se aplican | No hay nodemon: reinicia el proceso (`docker compose restart backend`) |
| El seed no corre | `NODE_ENV=production` lo bloquea a propósito |
