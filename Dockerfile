# ---- build the Nuxt app ----
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- runtime: API + built frontend ----
FROM node:22-alpine
ENV NODE_ENV=production PORT=4000
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY backend/ ./
COPY --from=web /web/.output/public /app/frontend/.output/public
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["sh", "-c", "node src/init.js && node src/server.js"]
