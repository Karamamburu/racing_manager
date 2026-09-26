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
RUN apk add --no-cache openssl \
  && addgroup -S app && adduser -S app -G app
COPY package.json package-lock.json ./
# Skip postinstall (prisma generate) — client is copied from the build stage.
RUN npm ci --omit=dev --ignore-scripts && chown -R app:app /app
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/generated ./generated
USER app
EXPOSE 4000
CMD ["node", "dist/main.js"]
