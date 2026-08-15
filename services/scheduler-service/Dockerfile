FROM node:22-alpine

# openssl: Prisma 필수 / btree_gist 마이그레이션 대비
RUN apk add --no-cache openssl postgresql-client

WORKDIR /shared
COPY shared/ ./
RUN npm install && npx tsc

WORKDIR /app

COPY scheduler-service/package*.json ./
RUN npm install

COPY scheduler-service/ .

RUN npx prisma generate
RUN npm run build

EXPOSE 8005

COPY shared/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
CMD ["/docker-entrypoint.sh"]
