# Imagen ligera (Alpine) según el diseño de la arquitectura
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# npm install (no ci) para tolerar cambios de dependencias; solo producción
RUN npm install --omit=dev && npm cache clean --force

COPY . .

# Directorio persistente para la base SQLite
RUN mkdir -p /data
ENV DB_PATH=/data/midatabase.db \
    NODE_ENV=production \
    PORT=8080

EXPOSE 8080 6061

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/status || exit 1

CMD ["node", "index.js"]
