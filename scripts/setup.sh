#!/bin/bash

echo "🚀 Setting up Telegram GitLab Bot..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "⚠️  Please edit .env file with your tokens:"
    echo "   - TELEGRAM_BOT_TOKEN (get from @BotFather)"
    echo "   - GITLAB_API_TOKEN (get from GitLab settings)"
fi

# Create logs directory
mkdir -p logs

# Build the project
echo "🔨 Building project..."
npm run build

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your tokens"
echo "2. Run 'npm run dev' for development"
echo "3. Run 'npm start' for production"
echo "4. Run 'docker-compose up -d' for Docker deployment"
