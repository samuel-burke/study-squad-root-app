#!/bin/sh
# With a backup bucket, Litestream runs the host and backs up while it runs.
set -e
if [ -n "$LITESTREAM_BUCKET" ]; then
  exec litestream replicate -config /app/discord/litestream.yml -exec "node discord/dist/main.js"
fi
exec node discord/dist/main.js
