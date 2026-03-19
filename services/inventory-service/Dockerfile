FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /shared
COPY shared/ ./
WORKDIR /app
COPY inventory-service/package*.json ./
RUN npm install
COPY inventory-service/ .
RUN npx prisma generate
RUN npm run build
EXPOSE 8004
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm start"]
