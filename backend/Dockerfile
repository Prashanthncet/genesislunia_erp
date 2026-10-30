# Genesis ERP API — production image.
# Build:  docker build -t genesis-erp-api ./backend
# Run:    see docker-compose.yml (needs JWT_SECRET, CORS_ORIGINS, FRONTEND_URL, DATABASE_URL)

# DB_PROVIDER=postgresql builds against prisma/postgres/schema.prisma (production
# PostgreSQL); the default sqlite suits a single small server.
ARG DB_PROVIDER=sqlite

FROM node:22-bookworm-slim AS build
ARG DB_PROVIDER
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY prisma ./prisma
COPY scripts ./scripts
RUN if [ "$DB_PROVIDER" = "postgresql" ]; then npx prisma generate --schema prisma/postgres/schema.prisma; else npx prisma generate; fi
COPY tsconfig.json ./
COPY src ./src
RUN npx nest build && npm prune --omit=dev --legacy-peer-deps

FROM node:22-bookworm-slim
ARG DB_PROVIDER
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --system --uid 1001 erp && mkdir -p /home/erp/.npm /data /backups && chown -R erp:erp /home/erp /data /backups
# Postgres builds need pg_dump/pg_restore of the server's major version for backups;
# Debian bookworm ships 15, so take 17 from the official PostgreSQL apt repository.
RUN if [ "$DB_PROVIDER" = "postgresql" ]; then \
      apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
      && install -d /usr/share/postgresql-common/pgdg \
      && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
      && apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 \
      && rm -rf /var/lib/apt/lists/*; \
    fi
ENV NODE_ENV=production PORT=3001 DATABASE_URL=file:/data/erp.db PRISMA_SCHEMA=${DB_PROVIDER} HOME=/home/erp
COPY --from=build --chown=erp /app/node_modules ./node_modules
COPY --from=build --chown=erp /app/dist ./dist
COPY --from=build --chown=erp /app/prisma ./prisma
COPY --chown=erp package.json ./
COPY --chown=erp scripts ./scripts
USER erp
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start. Migrations are additive and idempotent.
CMD ["sh", "-c", "if [ \"$PRISMA_SCHEMA\" = postgresql ]; then ./node_modules/.bin/prisma migrate deploy --schema prisma/postgres/schema.prisma; else ./node_modules/.bin/prisma migrate deploy; fi && node dist/src/main"]
