# Telegram GitLab Bot

A powerful Telegram bot for managing GitLab projects, branches, and CI/CD pipelines directly from Telegram.

## Features

- 📋 **Project Management**: List and view GitLab projects
- 🌿 **Branch Management**: Create, list, and delete branches
- 🚀 **Pipeline Control**: Trigger pipelines and check status
- 🔐 **Security**: User authentication and authorization
- 🐳 **Docker Ready**: Containerized deployment
- 🔄 **CI/CD Integration**: GitLab CI/CD pipeline included
- 📊 **Logging**: Comprehensive logging with Winston
- 🧠 **Memory Bank**: AI context preservation system

## Quick Start

### Prerequisites

- Node.js 18+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- GitLab API Token
- Docker (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd tele-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp env.example .env
   # Edit .env with your tokens
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

### Environment Variables

```env
# Required
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
GITLAB_API_TOKEN=your_gitlab_api_token

# Optional
GITLAB_BASE_URL=https://gitlab.com/api/v4
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
ALLOWED_USERS=user1,user2,user3
```

## Bot Commands

### Project Management
- `/projects` - List your GitLab projects

### Branch Management
- `/branches <project_id>` - List branches for a project
- `/create_branch <project_id> <branch_name> [from_branch]` - Create a new branch
- `/delete_branch <project_id> <branch_name>` - Delete a branch

### Pipeline Management
- `/trigger_pipeline <project_id> [branch]` - Trigger a new pipeline
- `/pipelines <project_id>` - List recent pipelines
- `/pipeline_status <project_id> <pipeline_id>` - Get pipeline status

### General
- `/help` - Show help message
- `/start` - Welcome message

## Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f telegram-bot

# Stop
docker-compose down
```

### Using Docker

```bash
# Build image
docker build -t telegram-gitlab-bot .

# Run container
docker run -d \
  --name telegram-bot \
  -p 3000:3000 \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e GITLAB_API_TOKEN=your_gitlab_token \
  telegram-gitlab-bot
```

## Development

### Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Lint code
npm run lint:fix     # Fix linting issues
npm run format       # Format code with Prettier
```

### Project Structure

```
tele-bot/
├── src/
│   ├── bot/                 # Telegram bot implementation
│   │   ├── handlers/        # Command handlers
│   │   └── middleware/      # Bot middleware
│   ├── services/            # External service integrations
│   ├── config/              # Configuration management
│   ├── types/               # TypeScript type definitions
│   └── utils/               # Utility functions
├── memory-bank/             # AI context preservation
├── tests/                   # Test files
├── docker/                  # Docker configurations
└── logs/                    # Application logs
```

## Memory Bank System

The Memory Bank preserves AI development context across sessions:

- `projectbrief.md` - Project overview and goals
- `productContext.md` - Product requirements and user experience
- `systemPatterns.md` - Architecture and design patterns
- `techContext.md` - Technology stack and setup
- `activeContext.md` - Current development focus
- `progress.md` - Development status and milestones

## CI/CD Pipeline

The included GitLab CI/CD pipeline provides:

- **Test Stage**: Linting, unit tests, security scanning
- **Build Stage**: TypeScript compilation, Docker image building
- **Deploy Stage**: Staging and production deployment

### Pipeline Stages

1. **Test**: Code quality and security checks
2. **Build**: Application and Docker image building
3. **Deploy**: Environment-specific deployments

## Security

- User authentication via Telegram user ID/username
- GitLab API token security
- Docker security best practices
- Input validation and sanitization

## Monitoring

- Health check endpoint: `GET /health`
- Comprehensive logging with Winston
- Docker health checks
- Optional Prometheus metrics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the [Memory Bank](./memory-bank/) for context
2. Review existing issues
3. Create a new issue with detailed description

## Roadmap

- [ ] Webhook support for real-time notifications
- [ ] Multi-project management
- [ ] Advanced pipeline controls
- [ ] Integration with other Git platforms
- [ ] Web dashboard
- [ ] Metrics and analytics
