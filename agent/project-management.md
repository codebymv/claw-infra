# Project Management Skill

This skill provides comprehensive project management capabilities through a Kanban-style interface.

## Commands

### Project Browser
- **projects** - Browse all projects with pagination and filtering
- **select <project-id>** - Select a project for contextual operations
- **context** - Show current project selection status
- **clear** - Clear current project selection

### Task Management (requires selected project)
- **create-task "Title" [priority] [type]** - Create a new task
- **list-tasks [priority] [limit]** - List tasks in current project
- **search "query"** - Search tasks by content
- **boards** - Show all boards in current project
- **analytics [timeRange]** - Show project analytics

### Traditional Commands
- **create-project "Name" [description] [template]** - Create a new project
- **list-projects [limit] [status]** - List all projects

### Natural Language Processing
- **nlp "command"** - Process any project-related request in natural language

## Usage Examples

```
# Browse projects
projects

# Select a project
select proj_123

# Create a task in selected project
create-task "Design homepage" high feature

# List recent tasks
list-tasks high 10

# Search for tasks
search "homepage"

# Show project analytics
analytics 30d

# Natural language processing
nlp "show me all my high priority tasks"
```

## Implementation

All commands are implemented via the project-manager CLI tool:

```bash
node /app/project-manager.js <command> [args...]
```

## Environment Variables

- `ZEROCLAW_USER_ID` - User identifier for session management
- `ZEROCLAW_CHAT_ID` - Chat identifier for session management  
- `BACKEND_INTERNAL_URL` - Backend API URL
- `CLAW_API_KEY` - API key for backend authentication

## Features

- **Contextual Operations**: Select a project once, then work within that context
- **Session Management**: Per-user/chat context isolation with automatic cleanup
- **Natural Language**: Process complex requests in plain English
- **Real-time Updates**: WebSocket integration for live updates
- **Comprehensive Search**: Full-text search across tasks and comments
- **Analytics**: Velocity metrics, burndown charts, team productivity
- **Audit Logging**: Complete audit trail of all operations