# Project Management

This skill provides comprehensive project management capabilities through a Kanban-style interface.

## Usage

When users ask about projects or use commands like `/projects`, use the project management CLI:

```bash
node /app/project-manager.js projects
```

## Available Commands

- `projects` - Browse all projects
- `select <project-id>` - Select a project for context
- `create-task "Title"` - Create a new task
- `list-tasks` - List tasks in current project
- `search "query"` - Search tasks
- `analytics` - Show project analytics

## Examples

User: "/projects"
Action: Execute `node /app/project-manager.js projects`

User: "show my projects"  
Action: Execute `node /app/project-manager.js projects`

User: "create task called homepage design"
Action: Execute `node /app/project-manager.js nlp "create task called homepage design"`

User: "select project 123"
Action: Execute `node /app/project-manager.js select proj_123`

## Environment Setup

The CLI requires these environment variables:
- BACKEND_INTERNAL_URL
- CLAW_API_KEY
- ZEROCLAW_USER_ID
- ZEROCLAW_CHAT_ID