# ============================================================
# Sabq backend Dockerfile (Railway-aligned headless build)
# ============================================================
# Builds ONLY the Express server bundle. The frontend (Vite) is
# built separately on Cloudflare Pages — Railway runs the API in headless
# mode (SERVE_SPA=false default below).
#
# Note: this image does NOT serve the SPA. Local docker-compose
# users who want full-stack-on-one-port should override
# SERVE_SPA=true in their environment AND build the client
# bundle separately (see vercel.json or run `npm run build:client`
# locally and mount dist/public into the container).

# Stage 1: Builder
FROM node:24.20.0-alpine AS builder

# Bumped to bust Railway's docker layer cache when mobileApiRoutes.ts
# changes weren't being picked up despite commits landing on main. Any
# string change here invalidates every cached layer below.
ARG DEPLOY_MARKER=2026-05-16-mobileapi-redeploy
ENV DEPLOY_MARKER=$DEPLOY_MARKER

WORKDIR /app

# Skip downloading Puppeteer's Chrome in the builder — production uses
# Alpine system chromium instead (see production stage below).
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm ci

COPY . .
# Server-only bundle (skips Vite/client build, avoids dependency
# on attached_assets/ which is excluded in .dockerignore).
RUN npm run build:server

# Stage 2: Production
FROM node:24.20.0-alpine AS production

WORKDIR /app

# System Chromium for admin HTML→PDF (PR client report) and any other
# puppeteer callers. Alpine's bundled chrome from npm does not ship in
# this image (PUPPETEER_SKIP_DOWNLOAD below), so we point Puppeteer at
# the distro binary instead.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      font-noto \
      font-noto-arabic \
    && CHROME_BIN="$(command -v chromium-browser || command -v chromium)" \
    && test -n "$CHROME_BIN" \
    && ln -sf "$CHROME_BIN" /usr/bin/sabq-chromium \
    && /usr/bin/sabq-chromium --version

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/sabq-chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/sabq-chromium

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/drizzle.config.ts ./

# Apple Wallet pass templates + WWDR cert. These are runtime assets the
# PassKit service reads from disk relative to process.cwd() (=/app):
#   - server/lib/passkit/pass-template.pass/         (press card model)
#   - server/lib/passkit/loyalty-pass-template.pass/ (loyalty card model)
#   - server/lib/passkit/coupon-pass-template.pass/  (سبق بلس voucher model)
#   - certs/wwdr.pem                                 (Apple intermediate)
# They were missing in the prior image, which is why /api/v1/wallet/press/issue
# was throwing "Cannot import model: directory /app/server/lib/passkit/
# pass-template.pass not found" even after env-var creds were configured.
# Any NEW .pass template must get its own COPY line here or it will 404 in
# production while working locally.
COPY --from=builder /app/server/lib/passkit/pass-template.pass ./server/lib/passkit/pass-template.pass
COPY --from=builder /app/server/lib/passkit/loyalty-pass-template.pass ./server/lib/passkit/loyalty-pass-template.pass
COPY --from=builder /app/server/lib/passkit/coupon-pass-template.pass ./server/lib/passkit/coupon-pass-template.pass
COPY --from=builder /app/certs ./certs

# كتالوج الأنظمة — السجل + SYSTEM.md + لقطة الجرد (للوحة /dashboard/systems-catalog)
COPY --from=builder /app/docs/systems ./docs/systems

# Arabic fonts used by the press-card strip renderer
# (server/lib/passkit/PressCardImageRenderer.ts). Without these the
# Alpine container falls back to system sans-serif, which has no
# Arabic glyphs — the strip renders with the headers + logo but every
# Arabic text run comes out as blank space.
COPY --from=builder /app/server/fonts ./server/fonts

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

# --max-old-space-size: سقف صريح لكومة V8. تسرّب فجر 2026-07-25 رفع RSS إلى
# 3.1GB وحوّل العملية إلى zombie تحت وقفات GC لساعات بلا انهيار — بسقفٍ أدنى
# تنهار العملية سريعًا وتلتقطها restartPolicyType=ON_FAILURE فتعود خلال ثوانٍ.
# حارس server/utils/processWatchdog.ts يخرج برشاقة قبل هذا السقف أصلًا.
CMD ["node", "--max-old-space-size=3072", "dist/index.js"]
