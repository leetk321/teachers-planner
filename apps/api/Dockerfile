# syntax=docker/dockerfile:1

FROM node:20-alpine AS dependencies
WORKDIR /build
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="teacher-notebook-api" \
      org.opencontainers.image.version="${APP_VERSION}"

ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/app/apps/api/.data \
    SQLITE_PATH=/app/apps/api/.data/local.db \
    BACKUP_DIR=/app/apps/api/.data/backups \
    UPLOAD_DIR=/app/apps/api/.data/uploads \
    STUDENT_PHOTO_DIR=/app/apps/api/.data/student-photos

RUN apk add --no-cache libc6-compat libstdc++
WORKDIR /app/apps/api
COPY --from=dependencies /build/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
RUN mkdir -p .data && chown node:node .data

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD ["node", "scripts/container-readiness.mjs"]
CMD ["node", "scripts/start-api.mjs"]
