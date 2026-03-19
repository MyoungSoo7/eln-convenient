FROM node:20-slim

# puppeteer/chromium 의존성
RUN apt-get update && apt-get install -y \
  ca-certificates \
  fonts-liberation \
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
WORKDIR /app
COPY file-service/package*.json ./
RUN npm install
COPY file-service/ .
RUN npx prisma generate
RUN npm run build
EXPOSE 8008
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
