# syntax=docker/dockerfile:1

FROM node:20-alpine AS dependencies
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

FROM node:20-alpine AS builder
ARG APP_VERSION=dev
# Example only: override this build argument with your public API URL.
ARG NEXT_PUBLIC_API_BASE_URL=https://api.note.example.com
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
WORKDIR /build
COPY --from=dependencies /build/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY app ./app
COPY public ./public
RUN npm run build

FROM node:20-alpine AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="teacher-notebook-web" \
      org.opencontainers.image.version="${APP_VERSION}"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
WORKDIR /app/apps/web
COPY --from=dependencies /build/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --from=builder --chown=node:node /build/.next ./.next
COPY --from=builder --chown=node:node /build/public ./public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]
CMD ["./node_modules/.bin/next", "start", "-p", "3000"]
