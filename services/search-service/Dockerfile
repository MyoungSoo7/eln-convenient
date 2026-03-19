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
COPY shared/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 8006
CMD ["/docker-entrypoint.sh"]
