FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /shared
COPY shared/ ./
RUN npm install && npx tsc

WORKDIR /app

COPY experiment-tracker-service/package*.json ./
RUN npm install

COPY experiment-tracker-service/ .

RUN npm run build

EXPOSE 8013

CMD ["npm", "start"]
