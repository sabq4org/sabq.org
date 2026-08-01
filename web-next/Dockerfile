# Next.js SSR app (web-next) for Railway. Self-contained: builds only from the
# web-next/ context (no dependency on the parent monorepo at runtime). Uses
# Next "standalone" output so the runtime image stays small.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG STAGING_NO_INDEX=false
ENV STAGING_NO_INDEX=$STAGING_NO_INDEX
# API_ORIGIN/PUBLIC_SITE_URL are read at runtime; safe defaults during build.
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV STAGING_NO_INDEX=false
# Bind to all interfaces so Railway's proxy can reach the container.
ENV HOSTNAME=0.0.0.0
ENV PORT=3001

# Standalone bundle: minimal server + traced node_modules, plus static assets.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3001
CMD ["node", "server.js"]
