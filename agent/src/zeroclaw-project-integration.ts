import { 
  createProject, 
  listProjects, 
  getProject, 
  createBoard, 
  createTask, 
  moveTask, 
  searchTasks, 
  addComment, 
  getProjectAnalytics,
  processNaturalLanguageCommand 
} from './project-zeroclaw-tools';
import { projectBrowser } from './project-browser';
import { contextualCommands } from './contextual-commands';
import projectContextManager from './project-context-manager';

// ZeroClaw tool definitions for project management
// This integrates with ZeroClaw's tool system to provide project management capabilities

export const PROJECT_MANAGEMENT_ZEROCLAW_TOOLS = {
  // Core project management
  create_project: {
    description: 'Create a new kanban project for task management',
    parameters: {
      name: { type: 'string', required: true, description: 'Project name' },
      description: { type: 'string', required: false, description: 'Project description' },
      template: { type: 'string', required: false, enum: ['basic', 'software', 'marketing'], default: 'basic' }
    },
    handler: createProject
  },

  list_projects: {
    description: 'List all projects accessible to the agent',
    parameters: {
      limit: { type: 'number', required: false, default: 20 },
      status: { type: 'string', required: false, enum: ['active', 'archived'] }
    },
    handler: listProjects
  },

  get_project: {
    description: 'Get detailed information about a specific project',
    parameters: {
      projectId: { type: 'string', required: true, description: 'Project ID or name' }
    },
    handler: getProject
  },

  // Board management
  create_board: {
    description: 'Create a new kanban board in a project',
    parameters: {
      projectId: { type: 'string', required: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: false }
    },
    handler: createBoard
  },

  // Task/Card management
  create_task: {
    description: 'Create a new task card in a kanban column',
    parameters: {
      projectId: { type: 'string', required: true },
      boardId: { type: 'string', required: true },
      columnId: { type: 'string', required: true },
      title: { type: 'string', required: true },
      description: { type: 'string', required: false },
      type: { type: 'string', required: false, enum: ['task', 'feature', 'bug', 'epic', 'story'], default: 'task' },
      priority: { type: 'string', required: false, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
      tags: { type: 'array', required: false },
      dueDate: { type: 'string', required: false }
    },
    handler: createTask
  },

  move_task: {
    description: 'Move a task to a different column or position',
    parameters: {
      projectId: { type: 'string', required: true },
      boardId: { type: 'string', required: true },
      cardId: { type: 'string', required: true },
      targetColumnId: { type: 'string', required: true },
      position: { type: 'number', required: false }
    },
    handler: moveTask
  },

  search_tasks: {
    description: 'Search for tasks across projects using text search',
    parameters: {
      projectId: { type: 'string', required: true },
      query: { type: 'string', required: true },
      boardId: { type: 'string', required: false },
      status: { type: 'string', required: false },
      priority: { type: 'string', required: false },
      limit: { type: 'number', required: false, default: 10 }
    },
    handler: searchTasks
  },

  add_comment: {
    description: 'Add a comment to a task for collaboration',
    parameters: {
      projectId: { type: 'string', required: true },
      boardId: { type: 'string', required: true },
      cardId: { type: 'string', required: true },
      content: { type: 'string', required: true },
      parentId: { type: 'string', required: false }
    },
    handler: addComment
  },

  get_project_analytics: {
    description: 'Get analytics and insights for a project',
    parameters: {
      projectId: { type: 'string', required: true },
      timeRange: { type: 'string', required: false, enum: ['7d', '30d', '90d'], default: '30d' }
    },
    handler: getProjectAnalytics
  },

  // Natural language processing
  process_project_command: {
    description: 'Process natural language project management commands',
    parameters: {
      command: { type: 'string', required: true, description: 'Natural language command' }
    },
    handler: processNaturalLanguageCommand
  },

  // Interactive project browser and context management
  browse_projects: {
    description: 'Browse and select projects interactively (/projects command)',
    parameters: {
      userId: { type: 'string', required: true },
      chatId: { type: 'string', required: true },
      page: { type: 'number', required: false, default: 1 },
      filter: { type: 'string', required: false, enum: ['active', 'archived', 'all'], default: 'active' }
    },
    handler: async (args: any) => projectBrowser.handleProjectsCommand(args)
  },

  select_project: {
    description: 'Select a project as active context (/select command)',
    parameters: {
      projectId: { type: 'string', required: true },
      userId: { type: 'string', required: true },
      chatId: { type: 'string', required: true }
    },
    handler: async (args: any) => projectBrowser.selectProject(args.projectId, args.userId, args.chatId)
  },

  show_context: {
    description: 'Show current project context (/context command)',
    parameters: {
      userId: { type: 'string', required: true },
      chatId: { type: 'string', required: true }
    },
    handler: async (args: any) => projectBrowser.getContextStatus(args.userId, args.chatId)
  },

  clear_context: {
    description: 'Clear active project context (/clear command)',
    parameters: {
      userId: { type: 'string', required: true },
      chatId: { type: 'string', required: true }
    },
    handler: async (args: any) => projectBrowser.clearContext(args.userId, args.chatId)
  },

  // Contextual commands (work with active project)
  contextual_create_task: {
    description: 'Create task in active project context',
    parameters: {
      userId: { type: 'string', required: true },
      chatId: { type: 'string', required: true },
      title: { type: 'string', required: true },
      description: { type: 'string', required: false },
      type: { type: 'string', required: false, enum: ['task', 'feature', 'bug', 'epic', 'story'] },
      priority: { type: 'string', required: false, enum: ['low', 'medium', 'high', 'urgent'] },
      boardName: { type: 'string', required: false },
      columnName: { type: 'string', required: false }
    },
    handler: async (args: any) => contextualCommands.createTask(args.userId, args.chatId, args)
  },

  contextual_list_tasks: {
    description: 'List tasks in active project context',
    parameters: {
      userId: { type: 'string', required: true },
      chatId: { type: 'string', required: true },
      boardName: { type: 'string', required: false },
      status: { type: 'string', required: false },
      priority: { type: 'string', required: false },
      limit: { type: 'number', required: false, default: 10 }
    },
    handler: async (args: any) => contextualCommands.listTasks(args.userId, args.chatId, args)
  },

  contextual_search_tasks: {
    description: 'Search tasks in active project context',
    parameters: {
      userId: { type: 'string', required: true },
      chatId: { type: 'string', required: true },
      query: { type: 'string', required: true },
      boardName: { type: 'string', required: false },
      priority: { type: 'string', required: false },
      limit: { type: 'number', required: false, default: 10 }
    },
    handler: async (args: any) => contextualCommands.searchTasks(args.userId, args.chatId, args.query, args)
  },

  contextual_show_boards: {
    description: 'Show boards in active project context',
    parameters: {
      userId: { type: 'string', required: true },
      chatId: { type: 'string', required: true }
    },
    handler: async (args: any) => contextualCommands.showBoards(args.userId, args.chatId)
  },

  contextual_analytics: {
    description: 'Get analytics for active project context',
    parameters: {
      userId: { type: 'string', required: true },
      chatId: { type: 'string', required: true },
      timeRange: { type: 'string', required: false, enum: ['7d', '30d', '90d'], default: '30d' }
    },
    handler: async (args: any) => contextualCommands.getAnalytics(args.userId, args.chatId, args.timeRange)
  }
};

// Export tool registration function for ZeroClaw
export function registerProjectManagementTools() {
  // This would integrate with ZeroClaw's tool registration system
  // The exact implementation depends on ZeroClaw's plugin architecture
  console.log('[project-integration] Project management tools registered with ZeroClaw');
  return PROJECT_MANAGEMENT_ZEROCLAW_TOOLS;
}