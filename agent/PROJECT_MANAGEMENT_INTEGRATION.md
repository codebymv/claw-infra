# Project Management Integration Guide

This document explains how the project management feature integrates with the ZeroClaw agent and Telegram bot.

## Overview

The project management system provides kanban-style task management through:
- **Backend API**: Complete REST API for project, board, and card management
- **Frontend UI**: Web interface at `/projects` for visual project management  
- **Agent Integration**: ZeroClaw tools for programmatic project management via Telegram

## Agent Integration Architecture

```
Telegram Bot → ZeroClaw Agent → Project Tools → Backend API → Database
                     ↓
              Natural Language Processing
                     ↓
              Project Management Actions
```

## Available Commands

### Project Management
- `create project "Website Redesign"`
- `list my projects`
- `show project "Website Redesign"`

### Task Management  
- `create task "Design homepage" in project "Website"`
- `move task "Design homepage" to "In Progress"`
- `search "login" in project "Website"`

### Analytics & Insights
- `show analytics for project "Website"`
- `project health for "Website"`

### Collaboration
- `add comment "Working on this" to task "Design homepage"`

## Natural Language Processing

The agent can understand various ways of expressing project management commands:

**Project Creation:**
- "Create a new project called Website Redesign"
- "Set up a project for Mobile App Development"
- "I need a marketing project for Q1 Campaign"

**Task Management:**
- "Add a task to design the homepage"
- "Create a bug card for the login issue"
- "Move the homepage task to in progress"

**Search & Discovery:**
- "Find all tasks related to login"
- "Show me high priority bugs"
- "What tasks are overdue?"

## Configuration

### Environment Variables

```bash
# Backend connection
BACKEND_INTERNAL_URL=http://localhost:3000
CLAW_API_KEY=your-api-key

# Agent identification
ZEROCLAW_AGENT_ID=agent-unique-id
ZEROCLAW_AGENT_NAME=zeroclaw-primary

# ZeroClaw configuration
ZEROCLAW_API_KEY=your-openrouter-key
ZEROCLAW_TELEGRAM_BOT_TOKEN=your-telegram-token
ZEROCLAW_TELEGRAM_ALLOWED_USERS=user1,user2
```

### ZeroClaw Tool Registration

The agent automatically registers project management tools with ZeroClaw on startup:

```typescript
// Tools are registered in main.ts
registerProjectManagementTools();
```

## API Endpoints Used

The agent uses these backend endpoints:

### Agent-Specific Endpoints
- `POST /api/api/v1/agent/projects` - Create project
- `GET /api/api/v1/agent/projects` - List projects
- `GET /api/api/v1/agent/projects/{id}` - Get project details
- `POST /api/api/v1/agent/projects/{id}/workspace` - Create workspace
- `POST /api/api/v1/agent/projects/{id}/boards` - Create board
- `POST /api/api/v1/agent/projects/{id}/boards/{boardId}/columns/{columnId}/cards` - Create card

### Search & Analytics
- `GET /api/projects/{id}/search/cards` - Search cards
- `GET /api/projects/{id}/analytics/insights` - Get analytics

## Workspace Isolation

Each agent operation creates an isolated workspace:

```typescript
// Automatic workspace management
await client.createWorkspace(projectId);
await client.ensureWorkspace(projectId);
await client.terminateWorkspace(projectId);
```

This ensures:
- **Conflict Prevention**: Multiple agents don't interfere
- **Resource Management**: Proper cleanup after operations
- **Rate Limiting**: Controlled operation frequency
- **Audit Logging**: Complete operation tracking

## Usage Examples

### Telegram Bot Commands

```
User: "Create a project for our website redesign"
Bot: ✅ Created project "Website Redesign" (ID: proj_123)
     📋 Project URL: /projects/proj_123
     🎯 Template: basic
     
     The project is ready for task management. You can now:
     - Create boards with: create board "Sprint 1" in project "Website Redesign"
     - Add tasks with: create task "Design homepage" in project "Website Redesign"

User: "Add a task to design the homepage"
Bot: To create a task, I need to know which project and board. Try:
     "create task 'Design homepage' in project 'Website Redesign'"

User: "create task 'Design homepage' in project 'Website Redesign'"
Bot: ✅ Created task: "Design homepage"
     ✅ Type: task
     🟡 Priority: medium
     📋 Card ID: card_456
     🔗 URL: /projects/proj_123
     
     You can move this task with: move task "Design homepage" to "In Progress"
```

### Advanced Operations

```
User: "show analytics for Website Redesign"
Bot: 📊 Project Analytics (30d)
     
     📈 Velocity Metrics:
     • Cards completed: 12
     • Average completion time: 3.2 days
     • Throughput: 4 cards/week
     
     👥 Team Performance:
     • Active contributors: 3
     • Total comments: 28
     • Collaboration score: 8.5/10
     
     🎯 Project Health:
     • On-time delivery: 85%
     • Blocked cards: 2
     • Overdue cards: 1
```

## Error Handling

The agent provides helpful error messages:

```
❌ Failed to create project: Project name already exists
❌ Failed to move task: Target column not found
❌ Failed to search tasks: Project not accessible
```

## Real-Time Updates

When the agent makes changes:
- **WebSocket Broadcasting**: Real-time updates to web UI
- **Audit Logging**: Complete operation history
- **Team Notifications**: Automatic team member alerts

## Security & Permissions

- **API Key Authentication**: Secure backend access
- **Agent Identification**: Tracked operations per agent
- **Project Access Control**: Permission-based project access
- **Rate Limiting**: Prevents abuse and overload

## Troubleshooting

### Common Issues

1. **"Project not found"**
   - Check project name spelling
   - Verify project access permissions
   - Use `list my projects` to see available projects

2. **"Backend connection failed"**
   - Verify `BACKEND_INTERNAL_URL` is correct
   - Check `CLAW_API_KEY` is valid
   - Ensure backend service is running

3. **"Workspace creation failed"**
   - Check agent permissions
   - Verify project exists and is accessible
   - Review rate limiting settings

### Debug Mode

Enable debug logging:

```bash
RUST_LOG=zeroclaw=debug,zeroclaw::tools=debug
```

This will show detailed tool execution logs and API calls.

## Integration Status

✅ **Completed:**
- Backend API with full CRUD operations
- Frontend web interface
- Agent tool definitions and handlers
- Natural language processing
- Workspace isolation and management
- Real-time WebSocket updates
- Search and analytics
- Error handling and validation

🔄 **Ready for Use:**
- Telegram bot commands work immediately
- Web interface accessible at `/projects`
- All project management features available
- Real-time collaboration enabled

The project management feature is fully integrated and ready for production use through both the web interface and Telegram bot commands.