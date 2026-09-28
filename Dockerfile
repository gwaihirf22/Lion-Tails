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

# The commit this image was built from. Recorded on every generation_records
# row so a reader knows which era of the prompt code produced it -- prompts
# themselves are not stored, and are only reconstructible while that code is
# unchanged. Defaults to "unknown" for local builds.
ARG APP_VERSION=unknown
ENV APP_VERSION=$APP_VERSION
ENV NODE_ENV=production
ENV PORT=5000

COPY package.json package-lock.json ./
# No package manager in the runtime image. Nothing here runs npm or npx
# (entrypoint.sh runs node directly), and the npm bundled with the base image
# carries its own node_modules -- the first run of CI's Trivy gate failed on a
# fixable CRITICAL in npm's copy of `tar`, a package this app does not depend
# on. Removing npm removes that whole surface, and corepack goes with it.
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
              /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

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

# The same probe the compose file declares, so the image is healthy on its
# own and the deploy's health poll does not depend on the hand-synced compose
# copy on the host carrying the entry. /api/health answers 503 when a
# configured database is unreachable or its schema has drifted (decisions §6),
# which is what makes this a real check rather than "the port is open".
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/prod.js"]
