# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl su-exec \
  && addgroup -S app && adduser -S app -G app \
  && mkdir -p /var/log/racing-manager \
  && chown -R app:app /var/log/racing-manager
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && chown -R app:app /app
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/generated ./generated
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
# Entrypoint runs as root to fix log volume ownership, then drops to app via su-exec.
EXPOSE 4100
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
