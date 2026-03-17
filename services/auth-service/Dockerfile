FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 8001
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npx prisma db seed; npm start"]
