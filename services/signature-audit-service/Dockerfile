FROM node:20-slim

# Puppeteer/Chromium 의존성 + 한국어 폰트
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    fonts-liberation \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /shared
COPY shared/ ./
RUN npm install && npx tsc
WORKDIR /app
COPY signature-audit-service/package*.json ./
RUN npm install
COPY signature-audit-service/ .
RUN npx prisma generate && npm run build && cp -r src/templates dist/templates
COPY shared/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 8003
CMD ["/docker-entrypoint.sh"]
