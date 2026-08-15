FROM node:20-alpine
WORKDIR /shared
COPY shared/ ./
RUN npm install && npx tsc
WORKDIR /app
COPY eval-harness-service/package*.json ./
RUN npm install
COPY eval-harness-service/ .
RUN npm run build
EXPOSE 8011
CMD ["node", "dist/index.js"]
