FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /shared
COPY shared/ ./
RUN npm install && npx tsc
WORKDIR /app
COPY search-service/package*.json ./
RUN npm install
COPY search-service/ .
RUN npx prisma generate
RUN npm run build
EXPOSE 8006
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm start"]
