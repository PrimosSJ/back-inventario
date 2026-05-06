#!/usr/bin/env bash
set -euo pipefail

CONTAINER="primos-poto-bd"
DB="mydatabase"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups/backup_${TIMESTAMP}"

echo "=== Backup de MongoDB ==="
echo "Contenedor : ${CONTAINER}"
echo "Base datos : ${DB}"
echo "Destino    : ${BACKUP_DIR}"
echo ""

# 1. Dump inside the container
echo "Ejecutando mongodump en el contenedor..."
docker exec "${CONTAINER}" mongodump --db "${DB}" --out "/tmp/poto_dump"

# 2. Copy from container to host
echo "Copiando dump al host..."
mkdir -p "$(dirname "${BACKUP_DIR}")"
docker cp "${CONTAINER}:/tmp/poto_dump" "${BACKUP_DIR}"

# 3. Clean up inside container
docker exec "${CONTAINER}" rm -rf /tmp/poto_dump

echo ""
echo "Backup completado exitosamente."
echo "Archivos guardados en: ${BACKUP_DIR}"
