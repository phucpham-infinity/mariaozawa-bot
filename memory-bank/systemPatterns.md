# System Patterns: Telegram Bot Architecture

## Kiến trúc tổng thể

```
Telegram Bot <-> Bot Server <-> GitLab API
                      |
                 Memory Bank
```

## Core Components

### 1. Bot Handler

- **Pattern**: Command Pattern
- **Responsibility**: Parse và route Telegram commands
- **Location**: `src/bot/handlers/`

### 2. GitLab Service

- **Pattern**: Service Layer
- **Responsibility**: GitLab API interactions
- **Location**: `src/services/gitlab.service.ts`

### 3. Memory Bank

- **Pattern**: Repository Pattern
- **Responsibility**: Context storage và retrieval
- **Location**: `memory-bank/`

### 4. Configuration

- **Pattern**: Environment Configuration
- **Responsibility**: Manage secrets và settings
- **Location**: `src/config/`

## Key Design Decisions

### Command Structure

```
/create_branch <branch-name> [from-branch]
/trigger_pipeline <project-id> [branch]
/list_branches <project-id>
/pipeline_status <pipeline-id>
```

### Error Handling

- Graceful degradation
- User-friendly error messages
- Retry mechanism cho API calls
- Logging cho debugging

### Security

- Token-based authentication
- Rate limiting
- Input validation
- Secure credential storage

## Data Flow

1. User sends command via Telegram
2. Bot parses command và validates
3. Service layer calls GitLab API
4. Response formatted và sent back
5. Context saved to Memory Bank
