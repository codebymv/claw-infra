import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface ProjectTool {
  name: string;
  description: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  parameters: Record<string, any>;
  examples: string[];
}

export const PROJECT_MANAGEMENT_TOOLS: ProjectTool[] = [
  {
    name: 'create_project',
    description: 'Create a new kanban project for task management',
    endpoint: '/api/api/v1/agent/projects',
    method: 'POST',
    parameters: {
      name: { type: 'string', required: true, description: 'Project name' },
      description: { type: 'string', required: false, description: 'Project description' },
      template: { type: 'string', required: false, enum: ['basic', 'software', 'marketing'], default: 'basic' }
    },
    examples: [
      'Create a project called "Website Redesign"',
      'Create a software project for "Mobile App Development"',
      'Set up a marketing project for "Q1 Campaign"'
    ]
  },
  {
    name: 'list_projects',
    description: 'List all projects accessible to the agent',
    endpoint: '/api/api/v1/agent/projects',
    method: 'GET',
    parameters: {
      limit: { type: 'number', required: false, default: 20, description: 'Maximum number of projects to return' },
      status: { type: 'string', required: false, enum: ['active', 'archived'], description: 'Filter by project status' }
    },
    examples: [
      'Show me all my projects',
      'List active projects',
      'What projects do I have?'
    ]
  },
  {
    name: 'get_project',
    description: 'Get detailed information about a specific project',
    endpoint: '/api/api/v1/agent/projects/{projectId}',
    method: 'GET',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID or name to look up' }
    },
    examples: [
      'Show me details for the Website Redesign project',
      'Get information about project abc123',
      'What\'s in the Mobile App project?'
    ]
  },
  {
    name: 'create_workspace',
    description: 'Create an isolated workspace for agent operations in a project',
    endpoint: '/api/api/v1/agent/projects/{projectId}/workspace',
    method: 'POST',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID to create workspace in' },
      agentName: { type: 'string', required: true, description: 'Name of the agent' },
      maxConcurrentOperations: { type: 'number', required: false, default: 5, description: 'Max concurrent operations' }
    },
    examples: [
      'Create a workspace in the Website Redesign project',
      'Set up workspace for project management'
    ]
  },
  {
    name: 'create_board',
    description: 'Create a new kanban board in a project',
    endpoint: '/api/api/v1/agent/projects/{projectId}/boards',
    method: 'POST',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      name: { type: 'string', required: true, description: 'Board name' },
      description: { type: 'string', required: false, description: 'Board description' }
    },
    examples: [
      'Create a "Sprint 1" board in the Mobile App project',
      'Add a new board called "Bug Tracking"'
    ]
  },
  {
    name: 'list_boards',
    description: 'List all kanban boards in a project',
    endpoint: '/api/api/v1/agent/projects/{projectId}/boards',
    method: 'GET',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' }
    },
    examples: [
      'Show me all boards in the Website Redesign project',
      'List boards for project abc123'
    ]
  },
  {
    name: 'create_card',
    description: 'Create a new task card in a kanban column',
    endpoint: '/api/api/v1/agent/projects/{projectId}/boards/{boardId}/columns/{columnId}/cards',
    method: 'POST',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      boardId: { type: 'string', required: true, description: 'Board ID' },
      columnId: { type: 'string', required: true, description: 'Column ID (To Do, In Progress, Done, etc.)' },
      title: { type: 'string', required: true, description: 'Card title' },
      description: { type: 'string', required: false, description: 'Card description' },
      type: { type: 'string', required: false, enum: ['task', 'feature', 'bug', 'epic', 'story'], default: 'task' },
      priority: { type: 'string', required: false, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
      tags: { type: 'array', required: false, description: 'Array of tags' },
      dueDate: { type: 'string', required: false, description: 'Due date in ISO format' }
    },
    examples: [
      'Create a task "Design homepage mockup" in the To Do column',
      'Add a high priority bug card "Fix login issue" to the Backlog',
      'Create a feature card "User authentication" with due date next Friday'
    ]
  },
  {
    name: 'list_cards',
    description: 'List all cards in a board with filtering options',
    endpoint: '/api/api/v1/agent/projects/{projectId}/boards/{boardId}/cards',
    method: 'GET',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      boardId: { type: 'string', required: true, description: 'Board ID' },
      columnId: { type: 'string', required: false, description: 'Filter by column ID' },
      status: { type: 'string', required: false, enum: ['open', 'in_progress', 'blocked', 'completed', 'cancelled'] },
      assigneeId: { type: 'string', required: false, description: 'Filter by assignee' },
      priority: { type: 'string', required: false, enum: ['low', 'medium', 'high', 'urgent'] },
      limit: { type: 'number', required: false, default: 50, description: 'Maximum number of cards to return' }
    },
    examples: [
      'Show me all cards in the Website Redesign board',
      'List high priority cards in the Sprint 1 board',
      'Show me all cards assigned to me',
      'What cards are in the In Progress column?'
    ]
  },
  {
    name: 'get_card',
    description: 'Get detailed information about a specific card',
    endpoint: '/api/api/v1/agent/projects/{projectId}/boards/{boardId}/cards/{cardId}',
    method: 'GET',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      boardId: { type: 'string', required: true, description: 'Board ID' },
      cardId: { type: 'string', required: true, description: 'Card ID' }
    },
    examples: [
      'Show me details for card abc123',
      'Get information about the "Design homepage" card'
    ]
  },
  {
    name: 'move_card',
    description: 'Move a card to a different column or position',
    endpoint: '/api/api/v1/agent/projects/{projectId}/boards/{boardId}/cards/{cardId}/move',
    method: 'PUT',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      boardId: { type: 'string', required: true, description: 'Board ID' },
      cardId: { type: 'string', required: true, description: 'Card ID' },
      targetColumnId: { type: 'string', required: true, description: 'Target column ID' },
      position: { type: 'number', required: false, description: 'Position in the target column' }
    },
    examples: [
      'Move the "Design homepage" card to In Progress',
      'Move card abc123 to the Done column',
      'Put the login bug card in the Blocked column'
    ]
  },
  {
    name: 'update_card',
    description: 'Update card details like title, description, priority, etc.',
    endpoint: '/api/api/v1/agent/projects/{projectId}/boards/{boardId}/cards/{cardId}',
    method: 'PUT',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      boardId: { type: 'string', required: true, description: 'Board ID' },
      cardId: { type: 'string', required: true, description: 'Card ID' },
      title: { type: 'string', required: false, description: 'New card title' },
      description: { type: 'string', required: false, description: 'New card description' },
      priority: { type: 'string', required: false, enum: ['low', 'medium', 'high', 'urgent'] },
      status: { type: 'string', required: false, enum: ['open', 'in_progress', 'blocked', 'completed', 'cancelled'] },
      tags: { type: 'array', required: false, description: 'Array of tags' },
      dueDate: { type: 'string', required: false, description: 'Due date in ISO format' }
    },
    examples: [
      'Update the "Design homepage" card to high priority',
      'Mark card abc123 as completed',
      'Change the description of the login bug card'
    ]
  },
  {
    name: 'add_comment',
    description: 'Add a comment to a card for collaboration',
    endpoint: '/api/api/v1/agent/projects/{projectId}/boards/{boardId}/cards/{cardId}/comments',
    method: 'POST',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      boardId: { type: 'string', required: true, description: 'Board ID' },
      cardId: { type: 'string', required: true, description: 'Card ID' },
      content: { type: 'string', required: true, description: 'Comment content (supports markdown)' },
      parentId: { type: 'string', required: false, description: 'Parent comment ID for threading' }
    },
    examples: [
      'Add a comment "Working on this now" to the homepage card',
      'Comment on card abc123 with progress update',
      'Reply to the previous comment with "Looks good!"'
    ]
  },
  {
    name: 'list_comments',
    description: 'List all comments on a card',
    endpoint: '/api/api/v1/agent/projects/{projectId}/boards/{boardId}/cards/{cardId}/comments',
    method: 'GET',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      boardId: { type: 'string', required: true, description: 'Board ID' },
      cardId: { type: 'string', required: true, description: 'Card ID' },
      limit: { type: 'number', required: false, default: 20, description: 'Maximum number of comments to return' }
    },
    examples: [
      'Show me all comments on the homepage card',
      'List comments for card abc123',
      'What are the latest comments on this task?'
    ]
  },
  {
    name: 'bulk_card_operation',
    description: 'Perform bulk operations on multiple cards at once',
    endpoint: '/api/api/v1/agent/projects/{projectId}/boards/{boardId}/cards/bulk',
    method: 'POST',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      boardId: { type: 'string', required: true, description: 'Board ID' },
      operation: { type: 'string', required: true, enum: ['move', 'update', 'delete'], description: 'Bulk operation type' },
      cardIds: { type: 'array', required: true, description: 'Array of card IDs to operate on' },
      data: { type: 'object', required: false, description: 'Operation-specific data' }
    },
    examples: [
      'Move all cards with "bug" tag to the Backlog column',
      'Mark all completed cards as archived',
      'Update priority to high for all urgent cards'
    ]
  },
  {
    name: 'search_cards',
    description: 'Search for cards across projects using text search',
    endpoint: '/api/projects/{projectId}/search/cards',
    method: 'GET',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      q: { type: 'string', required: true, description: 'Search query' },
      boardId: { type: 'string', required: false, description: 'Filter by board ID' },
      columnId: { type: 'string', required: false, description: 'Filter by column ID' },
      status: { type: 'string', required: false, description: 'Filter by status' },
      priority: { type: 'string', required: false, description: 'Filter by priority' },
      limit: { type: 'number', required: false, default: 20, description: 'Maximum number of results' }
    },
    examples: [
      'Search for cards containing "login" in the Website project',
      'Find all cards with "bug" in the title',
      'Search for high priority cards containing "homepage"'
    ]
  },
  {
    name: 'get_project_analytics',
    description: 'Get analytics and insights for a project',
    endpoint: '/api/projects/{projectId}/analytics/insights',
    method: 'GET',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      timeRange: { type: 'string', required: false, enum: ['7d', '30d', '90d'], default: '30d', description: 'Time range for analytics' }
    },
    examples: [
      'Show me analytics for the Website Redesign project',
      'Get project insights for the last 7 days',
      'What are the productivity metrics for this project?'
    ]
  },
  {
    name: 'get_project_health',
    description: 'Check the health status of a project workspace',
    endpoint: '/api/api/v1/agent/projects/{projectId}/health',
    method: 'GET',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID' }
    },
    examples: [
      'Check the health of the Website Redesign project',
      'Is the Mobile App project workspace healthy?'
    ]
  }
];

export function generateProjectToolsConfig(): string {
  const toolsConfig = {
    project_management: {
      enabled: true,
      base_url: process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000',
      api_key: process.env.CLAW_API_KEY || '',
      tools: PROJECT_MANAGEMENT_TOOLS.reduce((acc, tool) => {
        acc[tool.name] = {
          description: tool.description,
          endpoint: tool.endpoint,
          method: tool.method,
          parameters: tool.parameters,
          examples: tool.examples
        };
        return acc;
      }, {} as Record<string, any>)
    }
  };

  return JSON.stringify(toolsConfig, null, 2);
}

export function writeProjectToolsConfig(): void {
  const configDir = '/app/.zeroclaw';
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const configPath = join(configDir, 'project-tools.json');
  const config = generateProjectToolsConfig();
  
  writeFileSync(configPath, config, 'utf-8');
  console.log(`[project-tools] Wrote project management tools config to ${configPath}`);
}