FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /shared
COPY shared/ ./
RUN npm install && npx tsc
WORKDIR /app
COPY auth-service/package*.json ./
RUN npm install
COPY auth-service/ .
RUN npx prisma generate
RUN npm run build
COPY shared/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 8001
ENV SEED_ON_START=true
CMD ["/docker-entrypoint.sh"]
