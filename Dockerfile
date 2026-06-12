# RSG AI agent API container (src/server). The invoice-sender Lambda deploys
# separately via SAM; this image only serves the agent.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Lockfile-faithful install, dev deps (full puppeteer + Chrome download) excluded.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

ENV PORT=8787
EXPOSE 8787

# Run as the unprivileged user the base image provides
USER node

CMD ["node", "src/server/index.js"]
