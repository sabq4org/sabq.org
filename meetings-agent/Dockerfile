FROM node:22-slim

# مكتبة LiveKit الأصلية (Rust FFI) تقرأ شهادات CA من مخزن النظام —
# صورة slim لا تتضمنها (Node يستخدم مخزنه المدمج، لذا npm يعمل بدونها)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
# devDependencies مطلوبة للبناء (tsc)
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
CMD ["npm", "run", "start"]
