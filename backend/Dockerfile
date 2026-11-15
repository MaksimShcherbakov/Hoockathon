FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /code
COPY backend/package*.json ./
COPY backend/prisma ./prisma
RUN npm ci
COPY ./.env /code/.env
COPY backend/tsconfig.json backend/prisma.config.ts ./
COPY backend/src ./src
COPY backend/test ./test
RUN npm run build && npm prune --omit=dev
USER node
EXPOSE 3000
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/server.js"]
