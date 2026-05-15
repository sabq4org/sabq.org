# ============================================================
# Sabq backend Dockerfile (Railway-aligned headless build)
# ============================================================
# Builds ONLY the Express server bundle. The frontend (Vite) is
# built separately on Vercel — Railway runs the API in headless
# mode (SERVE_SPA=false default below).
#
# Note: this image does NOT serve the SPA. Local docker-compose
# users who want full-stack-on-one-port should override
# SERVE_SPA=true in their environment AND build the client
# bundle separately (see vercel.json or run `npm run build:client`
# locally and mount dist/public into the container).

# Stage 1: Builder
FROM node:20-alpine AS builder

# Bumped to bust Railway's docker layer cache when mobileApiRoutes.ts
# changes weren't being picked up despite commits landing on main. Any
# string change here invalidates every cached layer below.
ARG DEPLOY_MARKER=2026-05-16-mobileapi-redeploy
ENV DEPLOY_MARKER=$DEPLOY_MARKER

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Server-only bundle (skips Vite/client build, avoids dependency
# on attached_assets/ which is excluded in .dockerignore).
RUN npm run build:server

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/drizzle.config.ts ./

RUN npm ci --omit=dev && npm cache clean --force

RUN addgroup -g 1001 -S nodejs && \
    adduser -S sabq -u 1001

# Pre-create the uploads directory so the non-root user can write to it at runtime
RUN mkdir -p /app/uploads && chown sabq:nodejs /app/uploads

# Defensive: also pre-create dist/public. Headless mode (SERVE_SPA=false)
# never touches this dir, but if SERVE_SPA detection fails or someone
# overrides it, the SPA-serve code path tries to mkdir dist/public at
# startup. Without sabq ownership of /app/dist, that mkdir hits EACCES
# and aborts route registration mid-init.
RUN mkdir -p /app/dist/public && chown -R sabq:nodejs /app/dist

USER sabq

ENV NODE_ENV=production
# Railway injects PORT — default 5000 only matters for local docker run.
ENV PORT=5000
# Headless by default in this image. Override SERVE_SPA=true if you
# build the client separately and mount dist/public.
ENV SERVE_SPA=false

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "dist/index.js"]
