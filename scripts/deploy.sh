#!/bin/bash

set -e

echo "🚀 Deploying Telegram GitLab Bot to production..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found! Please create it first.${NC}"
    exit 1
fi

# Load environment variables
source .env

# Check required variables
if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$GITLAB_API_TOKEN" ]; then
    echo -e "${RED}❌ Missing required tokens in .env file${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Validating tokens...${NC}"
yarn validate-tokens

echo -e "${YELLOW}🔨 Building Docker image...${NC}"
docker-compose -f docker-compose.prod.yml build

echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose -f docker-compose.prod.yml down

echo -e "${YELLOW}🚀 Starting production containers...${NC}"
docker-compose -f docker-compose.prod.yml up -d

echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 10

echo -e "${YELLOW}🔍 Checking health...${NC}"
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Bot is running successfully!${NC}"
    echo -e "${GREEN}🔗 Health check: http://localhost:3000/health${NC}"
else
    echo -e "${RED}❌ Health check failed!${NC}"
    echo -e "${YELLOW}📋 Checking logs...${NC}"
    docker-compose -f docker-compose.prod.yml logs telegram-bot
    exit 1
fi

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo ""
echo -e "${YELLOW}📋 Useful commands:${NC}"
echo "  View logs: docker-compose -f docker-compose.prod.yml logs -f telegram-bot"
echo "  Stop bot: docker-compose -f docker-compose.prod.yml down"
echo "  Restart: docker-compose -f docker-compose.prod.yml restart telegram-bot"
echo "  Update: git pull && ./scripts/deploy.sh"
