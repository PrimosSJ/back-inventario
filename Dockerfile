# Usar la imagen base de Node.js
FROM node:20-alpine

# Crear el directorio de trabajo en el contenedor
WORKDIR /app

# Copiar package.json y package-lock.json para instalar dependencias
COPY . /app

# Instalar dependencias
RUN npm install

# Exponer el puerto donde tu aplicación Express se ejecutará (ajusta si usas otro puerto)
EXPOSE 4000

# Comando por defecto para iniciar la aplicación
CMD ["npm", "start"]
