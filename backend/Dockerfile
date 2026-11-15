FROM node:24-bookworm

WORKDIR /code
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
USER node
EXPOSE 3000

CMD ["sh", "-c", "npm run migrate && exec node dist/server.js"]
