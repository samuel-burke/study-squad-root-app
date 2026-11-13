# The Discord Activity's server (discord/), with the Study Squad server and
# the Activity's client build. Runs on AWS (infra/, docs/INFRA.md).
FROM node:22-bookworm-slim

# Litestream streams the SQLite databases to S3 (discord/litestream.yml).
# It needs the system CA certificates to reach S3.
COPY --from=litestream/litestream:0.5.17 /usr/local/bin/litestream /usr/local/bin/litestream
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

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
ENTRYPOINT ["/app/discord/docker-entrypoint.sh"]
