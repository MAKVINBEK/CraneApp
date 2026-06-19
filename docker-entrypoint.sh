#!/bin/sh
set -e

echo "[entrypoint] running migrations..."
cd /app && /usr/local/bin/migrate

echo "[entrypoint] starting services..."
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
