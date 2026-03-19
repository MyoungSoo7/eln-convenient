FROM node:20-alpine

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

# DB 스키마 적용 후 서버 시작
# --accept-data-loss: enum 변경 등 스키마 마이그레이션 허용 (dev 전용)
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm start"]
