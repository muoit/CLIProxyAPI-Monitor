#!/bin/sh
set -e

echo "==> Starting CLIProxyAPI Monitor..."

# Run database migrations with retry
echo "==> Running database migrations..."
MAX_RETRIES=30
RETRY_COUNT=0

until npx drizzle-kit push --force 2>/dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "==> Migration failed after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "==> Database not ready, retrying in 2s... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done
echo "==> Migrations completed!"

# Start the application
echo "==> Starting Next.js server on port ${PORT:-3000}..."
exec node server.js
