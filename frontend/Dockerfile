# Genesis ERP web — production image.
# BACKEND_URL is baked into the /api rewrite at BUILD time (Next.js evaluates rewrites() then).
FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG BACKEND_URL=http://api:3001
ENV BACKEND_URL=$BACKEND_URL NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx next build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN useradd --system --uid 1001 web
COPY --from=build --chown=web /app ./
USER web
EXPOSE 5173
CMD ["npx", "next", "start", "--port", "5173"]
