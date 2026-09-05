# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: full dependency install (build needs devDependencies)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# Stage 2: build the client (dist/public) and the server (dist/prod.js)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: runtime — production dependencies only
#
# This is only safe because server/prod.ts never imports server/vite.ts.
# See docs/decisions.md §9. The
# esbuild bundle uses --packages=external, so anything reachable from the entry
# module must exist in node_modules at runtime; pulling in Vite here would drag
# the whole devDependency tree into the image (and fail at startup without it).
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# WORKDIR must stay /app: generated story images are written to
# process.cwd()/public/images/stories and served from process.cwd()/public.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
# Migration SQL is applied at boot by scripts/migrate.js via drizzle-orm.
COPY --from=builder /app/migrations ./migrations
COPY entrypoint.sh ./entrypoint.sh

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs liontails \
    && chmod +x ./entrypoint.sh \
    && chown -R liontails:nodejs /app

USER liontails

EXPOSE 5000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/prod.js"]
