FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm install --include=dev && npm run build && npm prune --production

EXPOSE 8009

CMD ["node", "dist/index.js"]
