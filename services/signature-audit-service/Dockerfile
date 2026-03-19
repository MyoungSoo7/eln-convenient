FROM node:20-alpine

# Puppeteer용 Chromium + 한국어 폰트
RUN apk add --no-cache \
    openssl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto \
    font-noto-cjk

# puppeteer-core가 시스템 Chromium 사용하도록 설정
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /shared
COPY shared/ ./
RUN npm install && npx tsc
WORKDIR /app
COPY signature-audit-service/package*.json ./
RUN npm install
COPY signature-audit-service/ .
RUN npx prisma generate && npm run build && cp -r src/templates dist/templates
EXPOSE 8003
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm start"]
