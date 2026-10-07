# syntax=docker/dockerfile:1

# ---- frontend build stage ----
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json ./
COPY public ./public
COPY scripts ./scripts
RUN node scripts/build-frontend.js

# ---- runtime image (also used by the one-shot `verify` service) ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY package.json ./
COPY server ./server
COPY public ./public
COPY scripts ./scripts
COPY tests ./tests
COPY --from=frontend-build /app/dist ./dist

# Annotation data lives in /app/data (mount a volume to persist it).
RUN mkdir -p /app/data && chown -R app:app /app
USER app

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
