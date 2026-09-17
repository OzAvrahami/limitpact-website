# Operations source bundle, not the Next.js standalone web artifact.
# Select this path explicitly on the separately authorized retry service.
FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src/server ./src/server
COPY scripts/notifications.mjs ./scripts/notifications.mjs
USER node
ENV NODE_ENV=production
ENV NOTIFICATION_JOB_ENABLED=false
CMD ["node", "--conditions=react-server", "scripts/notifications.mjs", "scheduled-retry"]
