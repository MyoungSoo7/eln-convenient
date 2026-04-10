FROM node:20-alpine
WORKDIR /shared
COPY shared/ ./
RUN npm install && npx tsc
WORKDIR /app
COPY gemma-gateway/package*.json ./
RUN npm install
COPY gemma-gateway/ .
RUN npm run build
EXPOSE 8010
CMD ["node", "dist/index.js"]
