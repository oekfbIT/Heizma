# Build-Kontext: Projekt-Root (siehe docker-compose.yml)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci --workspace api --include-workspace-root=false
COPY api api
RUN npm run build -w api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci --workspace api --include-workspace-root=false --omit=dev
COPY --from=build /app/api/dist api/dist
WORKDIR /app/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
