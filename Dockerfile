FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
COPY packages/Vibe-Workflow/packages/workflow-builder/package*.json ./packages/Vibe-Workflow/packages/workflow-builder/
COPY packages/Open-Poe-AI/packages/agents/package*.json ./packages/Open-Poe-AI/packages/agents/
COPY packages/Open-AI-Design-Agent/packages/design-agent/package*.json ./packages/Open-AI-Design-Agent/packages/design-agent/
COPY packages/studio/package*.json ./packages/studio/
RUN npm install

# Build sub-packages
FROM deps AS builder
COPY . .
RUN npm run build:packages
RUN npm run build

# Production runner
FROM base AS runner
ENV NODE_ENV=production

# ffmpeg is the one runtime dependency the poster step needs: it decodes a single frame of a generated
# video, which `sharp` then stores as the asset's poster WebP. It comes from the distribution's own
# `community` repository, which is not guaranteed to be listed in the base image, so the repository for
# this image's own Alpine release is added once when it is missing. Nothing else in the image changes:
# no service, no GPU runtime, no npm package.
RUN grep -q '/community' /etc/apk/repositories \
 || echo "https://dl-cdn.alpinelinux.org/alpine/v$(cut -d. -f1,2 /etc/alpine-release)/community" >> /etc/apk/repositories
RUN apk add --no-cache ffmpeg
RUN ffmpeg -version > /dev/null
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/migrations ./migrations

EXPOSE 3000
CMD ["npm", "start"]
