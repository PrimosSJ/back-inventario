# POTO — Backend

API REST Node.js + Express + MongoDB para la Plataforma Optimizada de Trazabilidad y Organización.

## Requisitos

- Node.js 20+
- Docker + Docker Compose (para MongoDB)

## Configuración

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```
PORT=4000
MONGO_DB_URI=mongodb://localhost:27017/mydatabase
JWT_SECRET=cambia_esto_por_un_secreto_seguro
NODE_ENV=development
```

## Instalación y arranque

```bash
npm install
npm start          # servidor en puerto 4000
```

O con Docker (recomendado):

```bash
docker-compose up --build -d
```

## Migración de base de datos

Los modelos de inventario y préstamos cambiaron (se eliminaron `precio` y `monto`, se agregaron `tipo`, `tipo_prestamo`, `extensiones`, `email`). Antes de usar el backend actualizado sobre datos existentes, ejecutar el backup y luego la migración.

### 1. Backup

Requiere que el contenedor `primos-poto-bd` esté corriendo.

```bash
chmod +x scripts/backup.sh
./scripts/backup.sh
```

El dump queda en `backups/backup_YYYY-MM-DD_HH-MM/`. La carpeta `backups/` está en `.gitignore` y no se sube al repositorio.

### 2. Migrar

```bash
node scripts/migrate.js
```

El script se conecta con la URI definida en `.env` y aplica las siguientes transformaciones sin pérdida de datos:

**Colección `objetos`**
- Asigna `tipo: "unitario"` a documentos sin ese campo.
- Asigna `tipo_prestamo: "publico"` a documentos sin ese campo.
- Asigna `extensiones: []` a documentos sin ese campo.
- Elimina el campo `precio` (ya no se gestiona dinero).
- Elimina el campo `timestamp` manual (reemplazado por `createdAt`/`updatedAt` de Mongoose).

**Colección `prestamos`**
- Asigna `tipo_prestamo: "publico"` a documentos sin ese campo.
- Asigna `email: ""` a documentos sin ese campo (dato histórico no disponible).
- Elimina el campo `monto`.
- Elimina el campo `timestamp` manual.

### 3. Restaurar backup (si algo sale mal)

```bash
# Copia el dump de vuelta al contenedor
docker cp backups/backup_YYYY-MM-DD_HH-MM/mydatabase primos-poto-bd:/tmp/restore

# Restaura con mongorestore (--drop elimina los datos actuales antes de restaurar)
docker exec primos-poto-bd mongorestore --db mydatabase --drop /tmp/restore

# Limpia el archivo temporal
docker exec primos-poto-bd rm -rf /tmp/restore
```

Reemplaza `backup_YYYY-MM-DD_HH-MM` por el nombre exacto de la carpeta generada en el paso de backup.
