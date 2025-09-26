#!/bin/bash

echo "🔍 Killing all Telegram bot processes..."

# Kill all node processes running the bot
pkill -f "ts-node-dev.*src/index.ts" 2>/dev/null || true
pkill -f "node.*dist/index.js" 2>/dev/null || true
pkill -f "telegram-gitlab-bot" 2>/dev/null || true

# Kill processes on common ports
for port in 3000 3001 3002 3003 3004 3005; do
  lsof -ti:$port | xargs kill -9 2>/dev/null || true
done

# Clear any webhook
if [ ! -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "🧹 Clearing Telegram webhook..."
  curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook?drop_pending_updates=true" > /dev/null
fi

echo "✅ All bot processes killed and webhook cleared"
echo "You can now start the bot safely with: yarn dev"
