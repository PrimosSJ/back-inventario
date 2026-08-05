# POTO — Estado del proyecto

> Documento de referencia general. Describe **el estado real del repositorio** al 3 de agosto de 2026,
> extraído directamente del código fuente de `front-inventario/` y `back-inventario/`.
> Si algo aparece marcado con ⚠️ es una discrepancia o deuda técnica verificada en el código, no una suposición.

---

## 1. Introducción

### Qué es POTO

**POTO** (*Plataforma Optimizada de Trazabilidad y Organización*) es el sistema de **inventario ypréstamo de equipamiento** de los laboratorios del departamen to de informática de la universidad.

El nombre aparece desplegado en el header del frontend, letra por letra:

```
P lataforma  O ptimizada de  T razabilidad y  O rganización
```

### Para qué se usa

Los **ayudantes de laboratorio** usan POTO para llevar el registro de qué equipamiento sale y vuelve: calculadoras, notebooks, routers, Raspberry Pi, cables, adaptadores, juegos de mesa, etc.

El flujo típico en el mesón es:

1. El ayudante inicia sesión en POTO.
2. Llega alguien a pedir algo prestado.
3. El ayudante abre el modal de préstamo, busca el producto, pasa el carnet por el lector (el campo de RUT acepta la lectura del lector de códigos), consulta sus datos y registra el préstamo.
4. Cuando devuelven el equipo, el ayudante lo marca como devuelto y el stock/la unidad vuelve a quedar disponible.

Hay dos modalidades de préstamo:

- **Público** — préstamo corto, en el momento. Solo pide RUT, nombre y email.
- **Especial** — préstamo con plazo. Exige además teléfono y fecha de devolución esperada, y el sistema muestra un contador de tiempo restante / vencimiento.

---

## 2. Arquitectura general

POTO son **dos repositorios git independientes** dentro de una carpeta común:

```
POTO/
├── front-inventario/    ← repo git propio (SPA React + Vite)
└── back-inventario/     ← repo git propio (API Node/Express + MongoDB)
```

⚠️ La carpeta raíz `POTO/` **no** es un repositorio git ni un monorepo: no hay `package.json` raíz, ni workspaces, ni un `docker-compose.yml` que levante ambos. Cada mitad se clona, se instala y se despliega por separado.

### Diagrama de capas

```
┌───────────────────────────────────────────────────────────────────┐
│  NAVEGADOR (ayudante de laboratorio)                              │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  front-inventario — SPA React 18 + Vite (puerto 3000)       │  │
│  │                                                             │  │
│  │  AuthContext ──▶ token JWT en localStorage                  │  │
│  │  SocketContext ─▶ cliente socket.io                         │  │
│  │  TanStack Query ─▶ caché de préstamos + updates optimistas   │  │
│  │  Páginas: Préstamos · Inventario · Historial                │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────┬────────────────────────────────┬───────────────────┘
               │                                │
      HTTP/JSON (axios + fetch)          WebSocket (socket.io)
      Authorization: Bearer <jwt>        conexión abierta
               │                                │
┌──────────────▼────────────────────────────────▼───────────────────┐
│  back-inventario — Express 4 + socket.io (puerto 4000)            │
│                                                                   │
│  /auth        → authController   (login, register, verify-token)  │
│  /inventario  → inventoryController                               │
│  /prestamos   → prestamoController                                │
│                                                                   │
│  Middleware: cors(origin: '*') · express.json() · req.io          │
└──────────────────────────────┬────────────────────────────────────┘
                               │  Mongoose 8
┌──────────────────────────────▼────────────────────────────────────┐
│  MongoDB 6.0 (puerto 27017)                                       │
│  Colecciones: objetos · prestamos · users                         │
└───────────────────────────────────────────────────────────────────┘
```

### Cómo se comunican las capas

**Frontend → Backend (HTTP).** Todo pasa por [src/api/client.js](front-inventario/src/api/client.js),
que crea una instancia de axios con `baseURL = VITE_API_URL`. Dos interceptores:

- **Request:** inyecta `Authorization: Bearer <token>` leyendo el token de `localStorage`.
- **Response:** si llega un `401`, borra el token y recarga la página (salvo en modo mock).

Las llamadas están agrupadas por dominio en `src/api/`: `auth.api.js`, `inventory.api.js`, `loans.api.js`.

⚠️ `auth.api.js` usa `fetch` nativo en vez de la instancia axios, así que **no pasa por los interceptores**. Es intencional (evita el bucle de recarga al verificar un token inválido), pero significa que hay dos clientes HTTP conviviendo.

**Backend → MongoDB.** Mongoose se conecta al arrancar con `MONGO_DB_URI`. No hay capa de repositorio: los controladores hablan directo con los modelos.

**Tiempo real (Socket.io).** ⚠️ **Está cableado pero inerte.** Concretamente:

- El servidor crea el `Server` de socket.io, acepta conexiones, las loguea, y expone `req.io` a todas las rutas vía middleware ([server.js:38-41](back-inventario/server.js#L38-L41)).
- El frontend abre la conexión en [SocketContext.jsx](front-inventario/src/context/SocketContext.jsx) y **tres** consumidores escuchan eventos:
  - `useInventory.js` escucha `inventoryUpdate`
  - `useLoans.js` escucha `prestamosUpdate`
  - `HistoryPage.jsx` escucha `prestamosUpdate`
- **Ningún controlador del backend llama nunca a `req.io.emit(...)`.** Verificado por búsqueda: la única aparición de `io` fuera de `server.js` es la asignación `req.io = io`.

Consecuencia práctica: **dos ayudantes trabajando en paralelo no ven los cambios del otro en vivo.**
La sincronización que sí funciona es la local (updates optimistas de TanStack Query y `setState` manual tras cada mutación). Para ver los cambios de otra sesión hay que recargar. Cerrar este hueco es agregar los `emit` correspondientes en los controladores — el resto de la infraestructura ya existe.
Básicamente no es posible trabajar en paralelo con distintas sesiones, está hecho para trabajar en un solo equipo y en una sola sesión.

### Docker

Cada mitad tiene su propio `Dockerfile` y `docker-compose.yml`:

- **Backend:** [docker-compose.yml](back-inventario/docker-compose.yml) levanta dos servicios — `backend` (`primos-poto-backend`, puerto 4000) y `mongo` (`primos-poto-bd`, MongoDB 6.0, puerto
  27017 con volumen persistente `mongo-data`). Este es el compose útil, porque incluye la base de datos.
- **Frontend:** [docker-compose.yml](front-inventario/docker-compose.yml) levanta un solo servicio `app` (`primos-poto`) mapeando `8005:3000`.

⚠️ El `Dockerfile` del frontend ejecuta `CMD ["npm", "run", "dev"]` — es decir, corre el **servidor de desarrollo de Vite dentro del contenedor**, no un build estático servido por nginx. Funciona, pero no es un despliegue de producción como tal.

⚠️ El compose del frontend **no define ninguna variable de entorno**, así que `VITE_API_URL` queda sin
valor y cae al default `http://localhost:4000`. Además, las variables `VITE_*` de Vite se **inyectan en tiempo de build**, no de ejecución: pasarlas como `environment:` en el compose no bastaría; hay que pasarlas como build args o tener un `.env` presente al construir la imagen.

⚠️ El `docker-compose.yml` del backend trae `JWT_SECRET=your_jwt_secret` hardcodeado en el archivo.
Hay un comentario que dice "Cambia esto por un secreto seguro" — hacerlo es obligatorio antes de cualquier despliegue real.

---

## 3. Stack tecnológico

### Frontend — `front-inventario/package.json`

| Librería | Versión | Para qué se usa en POTO |
|---|---|---|
| `react` / `react-dom` | ^18.3.1 | Base de la SPA |
| `vite` | ^5.3.1 | Bundler y dev server (puerto 3000, `strictPort`) |
| `@vitejs/plugin-react` | ^4.3.1 | Fast Refresh y transformación JSX |
| `react-router-dom` | ^6.24.1 | Enrutado con `createBrowserRouter` (Data Router) |
| `@tanstack/react-query` | ^5.101.0 | Caché y mutaciones optimistas de **préstamos** |
| `axios` | ^1.7.2 | Cliente HTTP con interceptores de auth |
| `socket.io-client` | ^4.7.5 | Conexión WebSocket (ver ⚠️ de tiempo real) |
| `tailwindcss` + `@tailwindcss/vite` | ^4.3.1 | Estilos (Tailwind v4, configuración en CSS) |
| `daisyui` | ^5.0.0 | Componentes base y tema `dark` personalizado |
| `tailwind-variants` | ^3.2.2 | Variantes tipadas de los componentes UI propios (`tv()`) |
| `tailwind-merge` | ^3.6.0 | Resolución de conflictos de clases |
| `framer-motion` | ^12.40.0 | Transiciones de página, expansión de filas, action bar |
| `@floating-ui/react` | ^0.27.19 | Posicionamiento de `Tooltip` y `Menu` |
| `xlsx` | ^0.18.5 | Import/export de inventario en Excel |
| `qrcode.react` | ^4.0.1 | Render del QR con el `_id` del item |
| `@emailjs/browser` | ^4.4.1 | Envío de correos desde el navegador (desactivado por defecto) |
| `eslint` + plugins react | ^8.57.0 | Linting (`.eslintrc.cjs`, config legacy) |
| `autoprefixer` / `postcss` | — | Presentes como devDependencies |

⚠️ **`prop-types` se usa en 16 archivos pero no está declarado en `package.json`.** Funciona hoy porque llega como dependencia transitiva (está en el `package-lock.json` vía otros paquetes). Si esa dependencia intermedia cambia, el build se rompe. Debería agregarse explícitamente:
`npm install prop-types`.

### Backend — `back-inventario/package.json`

| Librería | Versión | Para qué se usa en POTO |
|---|---|---|
| `express` | ^4.19.2 | Framework HTTP y router |
| `mongoose` | ^8.4.4 | ODM: schemas `Objeto`, `Prestamo`, `User` |
| `socket.io` | ^4.7.5 | Servidor WebSocket (ver ⚠️ de tiempo real) |
| `jsonwebtoken` | ^9.0.2 | Firma y verificación de JWT (expiración 24h) |
| `bcryptjs` | ^3.0.2 | Hash de contraseñas (salt de 12 rondas, hook `pre('save')`) |
| `cors` | ^2.8.5 | CORS con `origin: '*'` |
| `dotenv` | ^16.4.5 | Carga del `.env` |

El backend usa **ESM** (`"type": "module"`), o sea `import`/`export`, no `require`.

⚠️ No hay dependencias de desarrollo: **no hay `nodemon`, ni linter, ni framework de tests**. El script `test` es el placeholder por defecto que falla a propósito.

---

## 4. Funcionalidades del sistema

### 4.1 Gestión de inventario

**Dos tipos de item.** Es la decisión de diseño central del modelo:

| | `tipo: "unitario"` | `tipo: "categoria"` |
|---|---|---|
| Qué representa | Un montón de cosas intercambiables | Un grupo de unidades identificadas una a una |
| Ejemplo | 12 cables de red, 8 cables HDMI | 5 notebooks: NB-01, NB-02, … |
| Control | Contador `stock` | Array `extensiones[]`, cada una con su `codigo` |
| Al prestar | `stock--` | esa extensión pasa a `disponible: false` |
| Al devolver | `stock++` | esa extensión vuelve a `disponible: true` |
| `stock` en la BD | Lo escribe el usuario | **Derivado**: el backend lo iguala a `extensiones.length` |

**Generación de extensiones por prefijo + rango.** En vez de crear las unidades una por una, se generan en bloque: se indica un prefijo (`NBP`, `RT`, `CALC`…) y un rango desde–hasta. El formato resultante es `` `${prefijo}-${número con padding a 2 dígitos}` `` ([inventory.utils.js:10-16](front-inventario/src/utils/inventory.utils.js#L10-L16)):

```js
generateExtensionCodes("NBP", 1, 5)
// → ["NBP-01", "NBP-02", "NBP-03", "NBP-04", "NBP-05"]
```

Validaciones aplicadas antes de generar (`validateExtensionGeneration`):
- El prefijo no puede estar vacío.
- `desde >= 1` y `hasta >= desde`.
- **Máximo 50 códigos por generación** (`MAX_EXTENSION_RANGE`).
- Al **editar** un item existente, se detectan colisiones contra los códigos ya presentes y se  muestran los duplicados concretos en el mensaje de error.

El backend revalida por su cuenta que los códigos sean únicos y que una categoría tenga al menos una extensión.

**Flujo de creación vs. edición.** Son deliberadamente distintos:
- **Crear** ([AgregarItem.jsx](front-inventario/src/components/inventario/AgregarItem.jsx)):  se generan las extensiones y quedan listas para guardar.
- **Editar** ([EditarItem.jsx](front-inventario/src/components/inventario/EditarItem.jsx)):  las nuevas extensiones pasan primero por una **vista previa** que hay que confirmar con "Agregar".  Si intentas guardar con una preview sin confirmar, sale un aviso y no se guarda. El campo `tipo`  queda **bloqueado** al editar (no se puede convertir un unitario en categoría ni al revés).

**Borrado protegido de extensiones.** Solo se pueden eliminar extensiones con `disponible: true`.
Intentar borrar una prestada muestra `No se puede eliminar "NB-03": está prestada.`

**Comentarios por extensión.** Cada extensión tiene un campo `comentario` libre para anotar el estado real de esa unidad concreta — *"Batería con autonomía reducida"*, *"Pantalla con rayón menor"*, *"Incluye maletín"*. Se edita desde un modal en la tabla expandida del inventario y se guarda con un `PATCH` dirigido a esa extensión. El comentario aparece como tooltip en la lista.

**Exportación a Excel.** Botón *Exportar* → descarga `inventario_POTO_YYYY-MM-DD.xlsx` con las columnas `Nombre`, `Descripción`, `Categoría`, `Tipo`, `Stock`, `Extensiones` (los códigos separados por coma).

**Importación desde Excel.** Botón *Importar* → se elige un `.xlsx`/`.xls`, se parsea en el navegador y se muestra una **vista previa** antes de confirmar. Columnas obligatorias: `Nombre`, `Descripción`, `Categoría`, `Stock`. La columna `Tipo` es opcional (default `unitario`). Al confirmar se manda todo al endpoint `/inventario/bulk`, que procesa fila por fila y responde `207` con un desglose de creados/errores; el frontend lista los errores indicando número de fila.

⚠️ **La importación no puede crear extensiones.** El controlador `bulkAddItems` fuerza `extensiones: []` y, si la fila dice `tipo: categoria`, le pone `stock: 0` ([inventoryController.js:213-220](back-inventario/controllers/inventoryController.js#L213-L220)).
O sea: importar una categoría por Excel crea un cascarón vacío que después hay que completar a mano desde *Editar*. Para items unitarios la importación funciona completa.

**Categorías dinámicas.** El campo "Categoría" (agrupador textual, no confundir con `tipo: categoria`) se llena desde un `<select>` alimentado por `GET /inventario/categorias`, que hace un `distinct` sobre la colección. La opción **"+ Nueva Categoría"** despliega un input de texto libre; al guardar el item, esa categoría nueva pasa a existir automáticamente para los siguientes.

**Filtros y orden en la tabla.** Buscador por nombre o descripción (con normalización que ignora acentos y mayúsculas) más un filtro por categoría. Las filas de tipo `categoria` se ordenan siempre **primero**. Cada fila de categoría muestra un indicador `disponibles/total` con barra de progreso y un tooltip con los porcentajes; se pinta en rojo cuando no queda nada disponible.

**Código QR.** Al editar un item se muestra un QR generado con `qrcode.react` que codifica el `_id` de Mongo del item, junto al `_id` en texto.

⚠️ **No existe un flujo que consuma ese QR.** El router actual solo tiene tres rutas (`/`, `/inventario`, `/historial_rut`) — no hay ninguna ruta tipo `/new_prestamo/:id` ni ningún lector de QR en la aplicación. El botón **"Prestar con QR"** del header abre el modal de préstamo normal, con el buscador por texto. El QR se genera para imprimirlo y pegarlo en el equipo, pero escanearlo no lleva a ninguna parte dentro de POTO hoy.

### 4.2 Gestión de préstamos

**Préstamo público vs. especial.** La modalidad se elige **al momento de prestar**, con un toggle en el formulario — no es una propiedad del producto:

| | Público | Especial |
|---|---|---|
| Campos obligatorios | RUT, nombre, email | RUT, nombre, email, **teléfono**, **fecha de devolución esperada** |
| Seguimiento de plazo | No | Sí, con contador y estados de vencimiento |
| Uso típico | Préstamo del rato, dentro del lab | Se lo llevan por días |

La validación es doble: primero en el formulario y después en el backend, que rechaza con `400` un préstamo especial sin teléfono o sin fecha. Si `tipo_prestamo` no viene en el payload, el backend asume `"publico"`.

**Préstamo de extensiones específicas.** Si el producto es de tipo `categoria`, el formulario carga `GET /inventario/:id/extensiones-disponibles` y muestra un `<select>` **solo con las unidades libres**. Es obligatorio elegir una. El backend revalida que la extensión exista y siga disponible antes de marcarla ocupada — así dos ayudantes no pueden prestar el mismo notebook.

**Buscador de producto con autocomplete.** El modal de préstamo se abre de dos formas:
- **Desde el inventario** (menú `⋮` → *Prestar*): el producto viene preseleccionado por `_id`.
- **Desde el header** (*Prestar con QR*): sin producto; aparece un input que a partir de **2
  caracteres** filtra por nombre o categoría y muestra un dropdown de resultados.

**Lector de RUT.** El componente [RutReader](front-inventario/src/components/shared/RutReader.jsx)sanitiza la entrada en vivo (solo dígitos, puntos, guiones y la letra K) y reconoce el formato que emite el lector de la cédula chilena: si detecta el patrón `RUN¿…` extrae el número; si recibe una cadena de 18 dígitos toma los últimos 8. Sirve igual escribiendo a mano.

**Marcar devolución.** Dos caminos:
- **Individual** — botón *Marcar Devuelto* en el historial por RUT.
- **Por lote** — en la página de Préstamos se seleccionan filas con checkbox (con "seleccionar todo" e indeterminado); aparece una barra de acción flotante y se devuelven todos de una. Si son más de 2, pide confirmación.

Ambos usan **actualizaciones optimistas** de TanStack Query: la UI cambia al instante y, si la petición falla, se revierte automáticamente al snapshot anterior.

⚠️ **La devolución por lote dispara N peticiones `PATCH` en paralelo** (`Promise.all`), no una petición masiva. Con las cantidades que maneja un laboratorio no es problema, pero no es atómico: si una falla, el `onError` revierte la caché completa aunque otras hayan tenido éxito.

**Devolución tolerante a datos legacy.** El controlador `marcarDevuelto` está escrito a propósito para no romperse con documentos antiguos:
- Usa `updateOne` + `$set` en vez de `save()` para **saltarse la validación de Mongoose**, porque hay préstamos viejos a los que les faltan campos hoy obligatorios (`tipo_prestamo`, `nombre_producto`).
- Restaura el stock/la extensión dentro de un `try/catch` separado, de modo que **un producto borrado nunca impide marcar el préstamo como devuelto** (solo loguea un warning).

**Filtros y orden de préstamos.** Filtro por estado (todos / solo pendientes / finalizados — por defecto **solo pendientes**) y por tipo (todos / especial / público). Búsqueda simultánea sobre nombre, RUT, producto y email. Orden por RUT, nombre, email, producto o fecha, ascendente o descendente. Un punto en el botón *Filtrar* avisa cuando hay filtros distintos del default.

### 4.3 Seguimiento

**Contador de tiempo restante.** [ReturnStatus.jsx](front-inventario/src/components/prestamos/ReturnStatus.jsx) convierte la fecha de devolución esperada en un badge con estado visual:

| Situación | Badge | Estilo |
|---|---|---|
| Préstamo finalizado | `Completado` | Verde, con tooltip de la fecha de devolución real |
| Público, o sin fecha esperada | `Pendiente` | Neutro |
| Vence en menos de 24h | `2h 30m` + ícono de reloj | `critical` — rojo rayado |
| Vence en ≤ 3 días | `2d 5h` + ícono | `warning` — amarillo rayado |
| Vence en ≤ 31 días | `12d` | `safe` — azul |
| Más de 31 días | Fecha formateada | `safe` |
| Ya venció | `Vencido hace 3 días` | Rojo sólido, negrita |

**Historial por RUT.** Página dedicada: se ingresa un RUT, se consulta `GET /prestamos/history/:rut` y se listan todos los préstamos de esa persona (activos e históricos), con el botón de devolución directo sobre los pendientes.

⚠️ **La búsqueda por RUT es de coincidencia exacta de string.** El backend hace `Prestamo.find({ rut: req.params.rut })` sin normalizar. Como `RutReader` entrega dígitos sin puntos y el `seed.js` guarda RUTs formateados (`20.345.678-5`), un mismo RUT guardado con formatos distintos **no se encontrará**. Si el historial aparece vacío para alguien que sí tiene préstamos, esta es casi siempre la causa. La solución de fondo es normalizar el RUT antes de guardar y antes de buscar.

**Formato de fechas contextual.** `formatTimestamp` (en [date.utils.js](front-inventario/src/utils/date.utils.js)) muestra `Hoy, 16:42`, `Ayer, 09:15`, `12 jun, 12:00` o `12 jun '25, 12:00` según cuán reciente sea, localizado a `es-CL`. El valor exacto queda en el tooltip.

**Búsqueda tolerante a acentos.** `normalizeText` quita tildes (normalización NFD) y pasa a minúsculas, así "cámara" encuentra "camara" y viceversa. Se usa tanto en inventario como en préstamos.

### 4.4 Autenticación

- **Login** con email y contraseña ([LoginForm.jsx](front-inventario/src/components/auth/LoginForm.jsx)),
  con toggle de visibilidad de la contraseña y errores animados.
- **JWT** firmado con `JWT_SECRET`, payload `{ id, email }`, **expiración de 24 horas**.
- **Contraseñas hasheadas** con bcrypt (12 rondas) mediante un hook `pre('save')`; el método  `toJSON()` del modelo borra el campo `password` de toda respuesta.
- **Usuarios desactivables** vía el flag `isActive`: un usuario con `isActive: false` no puede  autenticarse ni validar su token.
- **Persistencia de sesión:** el token vive en `localStorage`. Al montar la app, `AuthContext`  lo valida contra `GET /auth/verify-token`; si es inválido o expiró, lo borra y muestra el login.
- **Protección de rutas:** `ProtectedRoute` envuelve el `RouterProvider` **completo**  ([App.jsx:27-31](front-inventario/src/App.jsx#L27-L31)). No es protección ruta por ruta: sin  sesión no se ve absolutamente nada de la aplicación.
- **Logout** desde el header: borra el token y limpia el estado.

⚠️ **Los endpoints de negocio no están protegidos en el backend.** El middleware `verifyToken` solo se aplica a `GET /auth/verify-token`. Las rutas `/inventario` y `/prestamos` — incluyendo `DELETE` — **responden a cualquiera que las llame**, con o sin token. La protección hoy es puramente de interfaz. Combinado con `cors(origin: '*')`, cualquiera con acceso de red al puerto 4000 puede leer y modificar el inventario. Es el hallazgo de seguridad más relevante del repositorio.

⚠️ **Registro abierto.** `POST /auth/register` tampoco requiere autenticación: cualquiera con acceso al backend puede crearse una cuenta válida.

⚠️ **Si `JWT_SECRET` no está definido** en el entorno, `jwt.sign` lanza y el login devuelve `500` con "Error del servidor" — sin mensaje que apunte a la causa. Es el primer lugar donde mirar si el login falla en un entorno recién levantado.

### 4.5 Modo mock de desarrollo

Poniendo `VITE_IGNORE_AUTH_BACKEND=true` en el `.env` del frontend, la app **salta el login**: se autentica con un usuario ficticio (`dev@mock.local`) y el interceptor de axios deja de recargar la página ante un `401`, limitándose a loguear `[Mock Mode] Suppressed 401 Unauthorized reload.`
Sirve para trabajar en la UI sin backend de auth. **No debe activarse en producción.**

### 4.6 Correos automáticos (EmailJS)

Implementado y **desactivado por defecto**. Se activa solo con `VITE_EMAIL_ENABLED=true`; mientras esté en `false`, las funciones de correo son *no-ops* que resuelven de inmediato y no ensucian la consola con errores por falta de claves.

Con el envío activado hay dos correos:

1. **Confirmación de préstamo** — se dispara al crear un préstamo. Si el envío falla, el préstamo    **igual queda registrado** y aparece un aviso amarillo: *"Préstamo creado, pero no se pudo enviar   el email de confirmación."*
2. **Recordatorio de devolución** — el componente invisible
   [AlertasDevoluciones](front-inventario/src/components/shared/AlertasDevoluciones.jsx) consulta   cada **30 minutos** los préstamos especiales pendientes y manda recordatorio a los que vencen en   menos de 24 horas. Usa `localStorage` con clave `reminder_sent_<id>_<fecha>` para no mandar más de un recordatorio por préstamo por día.

⚠️ El anti-duplicado es **por navegador**: la clave vive en el `localStorage` del equipo que tenga la pestaña abierta. Si tres ayudantes tienen POTO abierto, la misma persona puede recibir hasta tres recordatorios. Y si nadie tiene la app abierta, no sale ninguno. Es una limitación estructural de mandar los correos desde el cliente; la solución real sería moverlo a un job del backend.

### 4.7 Interfaz

- **Tema oscuro fijo** (`data-theme="dark"` en el `<html>`), con paleta propia definida en  [index.css](front-inventario/src/css/index.css) — primario violeta `#A259FF` sobre base `#1E1E1E`.
- **Sistema de componentes propio** construido con `tailwind-variants`: `Table`, `Button`, `Menu`,  `Tooltip`, `SearchBar`, `Skeleton`, `DataStateManager`. No se depende de las clases de DaisyUI  para estos.
- **Estados de carga unificados.** `DataStateManager` / `QueryStateManager` centralizan los cinco estados posibles (`loading`, `error`, `empty`, `empty con filtros`, `success`) con slots  personalizables. Los estados de carga usan skeletons de tabla con efecto shimmer, no spinners.
- **Animaciones** con Framer Motion: transición entre páginas, expansión de extensiones, entrada y salida de la barra de acción por lote, reordenamiento de filas.
- **Formato chileno** de RUT y fechas en toda la interfaz.

---

## 5. Modelos de datos

Tres colecciones en MongoDB. Los tres schemas usan `{ timestamps: true }`, o sea que Mongoose agrega y mantiene `createdAt` y `updatedAt`.

### 5.1 `objetos` — [models/inventario.js](back-inventario/models/inventario.js)

Modelo Mongoose `Objeto` (Mongoose pluraliza a la colección `objetos`).

| Campo | Tipo | Reglas | Significado |
|---|---|---|---|
| `_id` | ObjectId | auto | Identificador; es lo que se codifica en el QR |
| `nombre` | String | **requerido** | Nombre del producto — *"Notebook Lenovo ThinkPad"* |
| `descripcion` | String | **requerido** | Detalle libre |
| `categoria` | String | **requerido** | Agrupador textual — *"Equipos de cómputo"*. Alimenta el filtro |
| `stock` | Number | **requerido** | Unitarios: cantidad total. Categorías: **derivado**, = `extensiones.length` |
| `tipo` | String | enum `unitario` \| `categoria`, default `unitario` | Determina toda la lógica de préstamo |
| `extensiones` | `[extensionSchema]` | default `[]` | Solo para `tipo: categoria`. Vacío en unitarios |
| `createdAt` / `updatedAt` | Date | auto | |

**Subdocumento `extensionSchema`** (con `{ _id: false }` — no genera id propio):

| Campo | Tipo | Reglas | Significado |
|---|---|---|---|
| `codigo` | String | **requerido** | Identificador de la unidad — `NB-01`. Único dentro del item (validado en el controlador) |
| `disponible` | Boolean | default `true` | `false` mientras está prestada |
| `comentario` | String | default `""` | Observación de esa unidad — *"Batería con autonomía reducida"* |

⚠️ La unicidad de `codigo` se valida **solo dentro del mismo item** y **solo en el controlador**, no a nivel de índice de MongoDB. Dos items distintos pueden tener extensiones con el mismo código.

### 5.2 `prestamos` — [models/prestamo.js](back-inventario/models/prestamo.js)

| Campo | Tipo | Reglas | Significado |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `rut` | String | **requerido** | RUT del solicitante. ⚠️ Sin normalizar — ver 4.3 |
| `nombre` | String | **requerido** | Nombre completo |
| `email` | String | **requerido** | Correo de contacto y destino de las notificaciones |
| `telefono` | String | opcional | **Obligatorio en préstamos especiales** (validado en el controlador) |
| `id_producto` | ObjectId → `Objeto` | **requerido** | Referencia al item prestado |
| `nombre_producto` | String | **requerido** | Nombre **copiado** al momento del préstamo (snapshot) |
| `tipo_prestamo` | String | enum `publico` \| `especial`, **requerido** | Default `"publico"` aplicado en el controlador |
| `extension_codigo` | String | opcional | Qué unidad concreta se prestó. Vacío en unitarios |
| `fecha_devolucion_esperada` | Date | opcional | **Obligatoria en especiales**. Alimenta el contador |
| `finalizado` | Boolean | default `false` | `true` = devuelto |
| `comentario` | String | opcional | Observación del préstamo |
| `createdAt` / `updatedAt` | Date | auto | `createdAt` = fecha del préstamo; `updatedAt` = fecha de devolución |

Notas de diseño:
- `nombre_producto` se guarda **duplicado a propósito**: el historial debe seguir siendo legible   aunque el producto se renombre o se borre del inventario.
- No hay campo `fecha_devolucion_real`: la devolución se infiere de `finalizado: true` +  `updatedAt`, que es lo que muestra el tooltip del badge "Completado".
- `tipo_prestamo` es `required` en el schema **pero no tiene `default`** — el default `"publico"` lo  pone el controlador. Por eso `marcarDevuelto` esquiva la validación de Mongoose: los documentos  anteriores a este campo fallarían al hacer `save()`.

### 5.3 `users` — [models/User.js](back-inventario/models/User.js)

| Campo | Tipo | Reglas | Significado |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `email` | String | **requerido**, **único**, lowercase, trim, regex | Identificador de login |
| `password` | String | **requerido**, mínimo 6 caracteres | Se guarda **hasheado** con bcrypt (12 rondas) |
| `isActive` | Boolean | default `true` | `false` bloquea login y validación de token |
| `createdAt` / `updatedAt` | Date | auto | |

Comportamiento del modelo:
- **Hook `pre('save')`** — hashea la contraseña solo si cambió. Implica que `insertMany` **no**  hashearía: hay que usar `save()` (el `seed.js` lo respeta explícitamente).
- **`comparePassword(candidata)`** — compara contra el hash con bcrypt.
- **`toJSON()`** — elimina `password` de toda serialización, así nunca sale por la API.

⚠️ No hay campo `role` ni ningún sistema de permisos. Todos los usuarios son equivalentes. El `AuthContext` del frontend inventa un `role: "admin"` únicamente en modo mock; el backend nunca devuelve ese campo.

### Relaciones

```
Objeto (1) ──────────< (N) Prestamo
   _id                     id_producto  (ref: 'Objeto')
   nombre        ─copia→   nombre_producto
   extensiones[].codigo ─copia→ extension_codigo

User  ──── sin relación con Prestamo ni Objeto
```

⚠️ No se registra **qué ayudante** hizo cada préstamo o devolución: no hay `ref` a `User` en `Prestamo`. La trazabilidad hoy es del *equipamiento*, no de *quién operó el sistema*.

⚠️ La referencia `id_producto` **nunca se usa con `.populate()`**. Toda la información que la interfaz necesita ya está copiada en el préstamo.

---

## 6. Estructura de carpetas

### Frontend — `front-inventario/`

```
front-inventario/
├── index.html                     Entrada de Vite. data-theme="dark" fijo
├── vite.config.js                 Plugins React + Tailwind v4; puerto 3000 strictPort
├── .eslintrc.cjs                  ESLint config legacy (no flat config)
├── Dockerfile                     ⚠️ corre `npm run dev`, no un build de producción
├── docker-compose.yml             Servicio único, 8005:3000
├── public/                        Estáticos: logo.png, background.png, favicon.png
└── src/
    ├── main.jsx                   ReactDOM.createRoot + StrictMode
    ├── App.jsx                    Providers: QueryClient → Auth → Socket → ProtectedRoute → Router
    ├── router.config.jsx          ⚠️ ARCHIVO MUERTO — ver nota abajo
    │
    ├── api/                       Capa HTTP, una por dominio
    │   ├── client.js              Instancia axios + interceptores de token y 401
    │   ├── auth.api.js            login y verify-token (usa fetch, no axios)
    │   ├── inventory.api.js       9 llamadas de inventario
    │   └── loans.api.js           5 llamadas de préstamos
    │
    ├── config/
    │   └── env.config.js          Único punto donde se leen las variables VITE_*
    │
    ├── context/
    │   ├── AuthContext.jsx        Sesión, login, logout, verificación, modo mock
    │   └── SocketContext.jsx      Conexión socket.io única y compartida
    │
    ├── hooks/
    │   ├── useInventory.js        useInventoryData (fetch + filtros) y useExtensionComments
    │   ├── useLoans.js            useLoansData (TanStack Query) + mutaciones optimistas
    │   └── useExcelImport.js      Parseo, preview y confirmación de la importación
    │
    ├── routes/                    ← ENRUTADO ACTIVO
    │   ├── index.jsx              createBrowserRouter con las 3 rutas reales
    │   └── MainLayout.jsx         Header + transiciones de página
    │
    ├── pages/                     Vistas de nivel superior (una por ruta)
    │   ├── LoansPage.jsx          "/"               Préstamos
    │   ├── InventoryPage.jsx      "/inventario"     Inventario
    │   └── HistoryPage.jsx        "/historial_rut"  Historial por RUT
    │
    ├── components/
    │   ├── auth/                  LoginForm, ProtectedRoute
    │   ├── inventario/            AgregarItem, EditarItem, EliminarItem, SelectCategoria, QRRender
    │   ├── prestamos/             AgregarPrestamo, DevolverPrestamo, ReturnStatus
    │   ├── layout/                Header, DataPageLayout
    │   ├── shared/                RutReader, AlertasDevoluciones
    │   ├── ui/                    Sistema de diseño propio (Table, Button, Menu, Tooltip,
    │   │                          SearchBar, Skeleton, DataStateManager, QueryStateManager)
    │   └── icons/                 24 íconos SVG como componentes + index.js barril
    │
    ├── services/
    │   ├── excel.service.js       exportarExcel / parsearExcel (xlsx)
    │   └── email.service.js       EmailJS con guarda EMAIL_ENABLED
    │
    ├── utils/
    │   ├── rut.utils.js           extractRutFromInput (lector de cédula), formatRut
    │   ├── date.utils.js          formatTimestamp, getPrestamoDate, calcularTexto
    │   ├── search.utils.js        normalizeText (sin acentos), lazyMatch
    │   └── inventory.utils.js     Generación/validación de extensiones, buildItemPayload
    │
    └── css/
        ├── index.css              Tailwind v4 + tema DaisyUI "dark" + shimmer
        └── functions.css          Función CSS --transparent() en oklch
```

⚠️ **`src/router.config.jsx` es código muerto que no compila.** Nadie lo importa (verificado por búsqueda: cero referencias), y sus imports apuntan a archivos que **ya no existen** — `./components/Inventario`, `./components/Prestamos`, `./components/inventario/ItemView`, `./components/prestamos/GetAllByRut`, `./components/shared/Header`. Es un resto de la estructura previa al rehacer el frontend, que sobrevivió porque nadie lo importa. También contiene la ruta `/new_prestamo/:id` que era la que consumía los QR. **Debería borrarse** — mientras siga ahí, confunde sobre cuál es el enrutado real ([routes/index.jsx](front-inventario/src/routes/index.jsx)).

### Backend — `back-inventario/`

```
back-inventario/
├── server.js                      Punto de entrada: Express, socket.io, Mongoose, montaje de rutas
├── package.json                   type: module (ESM). Scripts: start, seed
├── Dockerfile                     node:20-alpine, expone 4000
├── docker-compose.yml             backend + mongo 6.0 con volumen persistente
│
├── models/                        Schemas de Mongoose
│   ├── inventario.js              Objeto + extensionSchema embebido
│   ├── prestamo.js                Prestamo
│   └── User.js                    User + hash bcrypt + comparePassword + toJSON
│
├── routes/                        Definición de rutas (sin lógica)
│   ├── inventoryRoutes.js         10 rutas bajo /inventario
│   ├── prestamosRoutes.js         7 rutas bajo /prestamos
│   └── auth.js                    3 rutas bajo /auth
│
├── controllers/                   Lógica de negocio
│   ├── inventoryController.js     CRUD + extensiones + bulk
│   ├── prestamoController.js      Préstamos + devolución + consultas
│   └── authController.js          login, register, verifyToken (middleware), getProfile
│
├── scripts/
│   ├── seed.js                    Datos de prueba realistas (ver 7.4)
│   ├── migrate.js                 Migración de documentos legacy
│   └── backup.sh                  Dump de MongoDB vía docker exec
│
└── data/mongo/                    ⚠️ Datos locales de WiredTiger. Ignorado por git
```

---

## 7. Cómo levantar el proyecto

### 7.1 Requisitos

- **Node.js 20+** (es la versión de ambos Dockerfile: `node:20-alpine`).
- **Docker + Docker Compose** — la vía más simple para MongoDB.
- MongoDB 6.0 si prefieres correrlo nativo en vez de en contenedor.

### 7.2 Backend

```bash
cd back-inventario
npm install
```

Crear `back-inventario/.env`:

```env
PORT=4000
MONGO_DB_URI=mongodb://localhost:27017/mydatabase
JWT_SECRET=cambia_esto_por_un_secreto_largo_y_aleatorio
NODE_ENV=development
```

Levantar MongoDB y el backend con Docker (recomendado, incluye la base de datos):

```bash
docker compose up --build -d
```

O el backend a mano, contra un Mongo que ya esté corriendo:

```bash
npm start        # node server.js — sin recarga automática
```

Al conectar correctamente imprime `Conectado a la BD del POTO` y `Server running on port 4000`.

⚠️ No hay `nodemon` ni script `dev`: cada cambio en el código exige reiniciar el proceso a mano.

### 7.3 Frontend

```bash
cd front-inventario
npm install
```

No existe un `.env.example` en el repositorio. Crear `front-inventario/.env`:

```env
VITE_API_URL=http://localhost:4000
```

Y arrancar:

```bash
npm run dev      # http://localhost:3000
```

Sin `.env`, `VITE_API_URL` cae al default `http://localhost:4000`, que es justo lo que se necesita en desarrollo local — así que para trabajar en tu máquina el archivo es opcional.

### 7.4 Cargar datos de prueba

```bash
cd back-inventario
npm run seed
```

Deja la base con 13 items (9 unitarios + 4 categorías con extensiones), 16 préstamos en distintos estados (activos, vencidos, finalizados) y 4 usuarios:

| Email | Contraseña | Nota |
|---|---|---|
| `admin@poto.cl` | `admin123` | |
| `ayudante@poto.cl` | `ayudante123` | |
| `encargado.lab@poto.cl` | `labpoto2024` | |
| `test@poto.cl` | `test123` | Desactivado — sirve para probar el login bloqueado |

Modos del script:

```bash
node scripts/seed.js            # limpia las colecciones y reinserta
node scripts/seed.js --keep     # agrega sin borrar lo existente
node scripts/seed.js --wipe     # solo limpia y termina
```

El seed **se niega a correr si `NODE_ENV=production`**, como protección contra borrar datos reales.

### 7.5 Verificar que todo quedó conectado

```bash
curl http://localhost:4000/inventario           # → [] o el listado
curl http://localhost:4000/prestamos/pendientes # → []
```

---

## 8. Estado actual y pendientes

### 8.1 Funcional de punta a punta

- CRUD completo de inventario, con los dos tipos de item.
- Generación de extensiones por prefijo + rango, con validación de duplicados y tope de 50.
- Comentarios por extensión.
- Exportación a Excel.
- Importación desde Excel para items **unitarios**, con preview y reporte de errores por fila.
- Préstamos público y especial, con validación en cliente y servidor.
- Préstamo de extensiones específicas con verificación de disponibilidad en el backend.
- Buscador de productos con autocomplete.
- Devolución individual y por lote, con updates optimistas y rollback.
- Restitución automática de stock/extensión al devolver.
- Contador de tiempo restante con estados visuales y detección de vencidos.
- Historial por RUT (sujeto al ⚠️ del formato de RUT).
- Buscadores, filtros y ordenamiento en ambas tablas principales.
- Login, logout, persistencia de sesión y bloqueo de la app sin sesión.
- Categorías dinámicas.
- Generación de QR con el `_id` del item.
- Scripts de seed, migración y backup.

### 8.2 Implementado pero requiere configuración externa

**EmailJS** — el código está completo (confirmación de préstamo y recordatorio de devolución) pero apagado. Para activarlo hay que crear una cuenta en EmailJS, armar dos plantillas y agregar al `.env` del frontend:

```env
VITE_EMAIL_ENABLED=true
VITE_EMAILJS_SERVICE_ID=service_xxxxx
VITE_EMAILJS_TEMPLATE_PRESTAMO=template_xxxxx
VITE_EMAILJS_TEMPLATE_RECORDATORIO=template_xxxxx
VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxx
```

Variables que esperan las plantillas: `to_email`, `to_name`, `nombre_producto`, `extension_codigo`,`fecha_devolucion` y, solo en la de préstamo, `tipo_prestamo`.

Antes de activarlo, considerar las dos limitaciones de 4.6: los recordatorios dependen de que alguien tenga la pestaña abierta, y el anti-duplicado es por navegador.

**Modo mock** (`VITE_IGNORE_AUTH_BACKEND=true`) — herramienta de desarrollo. No activar en producción.

### 8.3 Deuda técnica y pendientes

Ordenados por impacto:

| # | Tema | Detalle | Dónde |
|---|---|---|---|
| 1 | **Endpoints sin autenticación** | `/inventario` y `/prestamos` no usan `verifyToken`. Cualquiera con acceso al puerto 4000 puede leer, crear y **borrar**. Con `cors: '*'`, desde cualquier origen | `routes/*.js` |
| 2 | **Socket.io no emite nada** | Toda la infraestructura de tiempo real existe en ambos lados, pero ningún controlador llama a `req.io.emit()`. No hay sincronización entre sesiones | `controllers/*.js` |
| 3 | **RUT sin normalizar** | Se guarda tal como se escribió; el historial busca por igualdad exacta. RUTs con y sin puntos no se cruzan | `prestamoController.js`, `RutReader.jsx` |
| 4 | **`router.config.jsx` es código muerto** | No lo importa nadie y sus imports apuntan a archivos borrados. Debería eliminarse | `front-inventario/src/` |
| 5 | **`prop-types` no declarado** | Se usa en 16 archivos, llega solo como dependencia transitiva | `front-inventario/package.json` |
| 6 | **Importación Excel incompleta** | `bulkAddItems` fuerza `extensiones: []`, así que las categorías importadas quedan vacías y hay que completarlas a mano | `inventoryController.js:213-220` |
| 7 | **Sin `nodemon` ni script `dev`** | Cada cambio en el backend requiere reiniciar el proceso a mano | `back-inventario/package.json` |
| 8 | **Sin tests** | Ninguna de las dos mitades tiene framework de testing. El script `test` del backend es el placeholder que falla | ambos |
| 9 | **Dockerfile de front no es de producción** | Corre `npm run dev` en el contenedor; falta build multi-stage + nginx | `front-inventario/Dockerfile` |
| 10 | **`JWT_SECRET` de ejemplo en el compose** | `JWT_SECRET=your_jwt_secret` está hardcodeado en el archivo versionado | `back-inventario/docker-compose.yml` |
| 11 | **`getProfile` sin ruta** | La función existe y está exportada, pero ninguna ruta la monta | `authController.js:167-188` |
| 12 | **No se registra quién opera** | `Prestamo` no referencia a `User`: no queda constancia de qué ayudante hizo cada préstamo o devolución | `models/prestamo.js` |
| 13 | **Sin `.env.example`** | Ninguna de las dos mitades trae plantilla de variables; hay que deducirlas del código (o de este documento) | ambos |
| 14 | **QR sin flujo que lo consuma** | Se generan QR con el `_id`, pero no hay lector ni ruta `/new_prestamo/:id` en el router actual | `front-inventario/src/routes/` |
| 15 | **`getItem` no distingue "no existe"** | `findById` de un id inexistente devuelve `200` con cuerpo `null` en vez de `404` | `inventoryController.js:130-139` |
| 16 | **Sin script `migrate` en npm** | El README documenta la migración pero `package.json` no expone el script; hay que invocar `node scripts/migrate.js` | `back-inventario/package.json` |
| 17 | **Endpoints sin consumidor** | `GET /inventario/:id/extensiones`, `GET /prestamos/pendientes`, `GET /prestamos/:id` y `POST /auth/register` existen pero el frontend no los llama. Registrar usuarios hoy exige un `curl` a mano | `routes/*.js` |
| 18 | **`README.md` del front desactualizado** | Dice editar la URL del backend en `src/utils.js`, archivo que ya no existe (la configuración vive en `src/config/env.config.js` vía `VITE_API_URL`) | `front-inventario/README.md` |

### 8.4 Nota sobre los comentarios del código

Buena parte de la documentación interna del frontend está en **inglés** con un registro marcadamente formal ("Enterprise-grade", "Architectural utility", "Deep structural immutability definition"). Los comentarios que explican decisiones de negocio concretas están en **español**.
Es simplemente el estilo que quedó del rehacer del frontend; no significa que haya dos capas distintas de código.

---

## 9. Referencia rápida de la API

Detalle completo en [back-inventario/README_NUEVO.md](back-inventario/README_NUEVO.md).

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/auth/register` | Crea un usuario ⚠️ sin autenticación |
| `POST` | `/auth/login` | Devuelve JWT válido 24h |
| `GET` | `/auth/verify-token` | Valida el token del header |
| `GET` | `/inventario` | Lista todo el inventario |
| `POST` | `/inventario` | Crea un item |
| `POST` | `/inventario/bulk` | Importación masiva → `207` con desglose |
| `GET` | `/inventario/categorias` | Categorías distintas existentes |
| `GET` | `/inventario/:id` | Un item |
| `PUT` | `/inventario/:id` | Actualiza un item |
| `DELETE` | `/inventario/:id` | Elimina un item |
| `GET` | `/inventario/:id/extensiones` | Todas las extensiones |
| `GET` | `/inventario/:id/extensiones-disponibles` | Solo las libres |
| `PATCH` | `/inventario/:id/extensiones/:codigo/comentario` | Edita el comentario de una unidad |
| `GET` | `/prestamos` | Lista todos los préstamos |
| `POST` | `/prestamos` | Crea un préstamo y descuenta inventario |
| `GET` | `/prestamos/pendientes` | Préstamos no finalizados |
| `GET` | `/prestamos/pendientes-especiales` | Especiales pendientes con fecha |
| `GET` | `/prestamos/:id` | Un préstamo |
| `GET` | `/prestamos/history/:rut` | Historial de una persona |
| `PATCH` | `/prestamos/return/:id` | Marca devuelto y restituye inventario |

---

## 10. Documentos relacionados

| Archivo | Contenido |
|---|---|
| [front-inventario/README_NUEVO.md](front-inventario/README_NUEVO.md) | Instalación, comandos, variables y estructura del frontend |
| [back-inventario/README_NUEVO.md](back-inventario/README_NUEVO.md) | API completa endpoint por endpoint, scripts operacionales, despliegue |
| [back-inventario/README.md](back-inventario/README.md) | README original del backend — vigente, cubre migración y restauración de backups |
| [front-inventario/README.md](front-inventario/README.md) | README original del frontend — ⚠️ desactualizado (ver deuda #18) |
