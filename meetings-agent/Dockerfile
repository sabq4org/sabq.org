FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev=false

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
CMD ["npm", "run", "start"]
