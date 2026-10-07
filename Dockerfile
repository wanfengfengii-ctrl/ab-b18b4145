FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --start-period=4s --retries=12 \
  CMD node scripts/healthcheck.js

CMD ["node", "server/server.js"]
