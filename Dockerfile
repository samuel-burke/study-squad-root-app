# The Discord Activity's server (discord/), with the Study Squad server and
# the Activity's client build. See docs/DISCORD.md.
FROM node:22-bookworm-slim

WORKDIR /app
COPY . .

# Public, so it's fine in the image: the client needs it to start Discord sign-in.
ARG VITE_DISCORD_CLIENT_ID
RUN test -n "$VITE_DISCORD_CLIENT_ID" \
  && npm ci \
  && npm run generate \
  && npm run build \
  && npm run build:discord -w @studyroom/client

ENV NODE_ENV=production DATA_DIR=/data PORT=8080
EXPOSE 8080
CMD ["node", "discord/dist/main.js"]
