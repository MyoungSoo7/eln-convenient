FROM node:20-alpine

RUN apk add --no-cache openssl postgresql-client

WORKDIR /shared
COPY shared/ ./
RUN npm install && npx tsc

WORKDIR /app

COPY model-registry-service/package*.json ./
RUN npm install

COPY model-registry-service/ .

RUN npx prisma generate
RUN npm run build

EXPOSE 8012

COPY shared/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
CMD ["/docker-entrypoint.sh"]
