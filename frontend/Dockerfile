# The web app, packaged as a Next standalone server.
#
# NEXT_PUBLIC_API_URL is a build arg, not a run-time variable: Next inlines
# NEXT_PUBLIC_* into the JavaScript the browser downloads, so setting it in the
# container's environment at start-up would be too late and silently do nothing.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:8200
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 --create-home nextjs
COPY --from=builder /app/public ./public
# `output: "standalone"` traces exactly the node_modules the server touches; the
# static assets and public/ are the two things it does not copy for you.
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
