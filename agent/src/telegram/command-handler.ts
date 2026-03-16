import {
  ParsedCommand,
  CommandResult,
  CommandError,
  UserContext,
  ProjectContext,
  UIResponse
} from './models';
import { TelegramMessage } from './types';
import { ICommandParser } from './command-parser';
import { ICommandRegistry } from './command-registry';
import { IUIResponseGenerator } from './ui-response-generator';

/**
 * Command Handler interface for orchestrating command execution
 */
export interface ICommandHandler {
  handleMessage(message: TelegramMessage, context: UserContext): Promise<CommandResult>;
  executeCommand(command: ParsedCommand): Promise<CommandResult>;
  validatePermissions(command: ParsedCommand): CommandError | null;
}

/**
 * Command Handler implementation
 */
export class CommandHandler implements ICommandHandler {
  private parser: ICommandParser;
  private registry: ICommandRegistry;
  private uiGenerator: IUIResponseGenerator;

  constructor(
    parser: ICommandParser,
    registry: ICommandRegistry,
    uiGenerator: IUIResponseGenerator
  ) {
    this.parser = parser;
    this.registry = registry;
    this.uiGenerator = uiGenerator;
  }

  async handleMessage(message: TelegramMessage, context: UserContext): Promise<CommandResult> {
    if (!message.text) {
      return {
        success: false,
        response: {
          text: '❌ I can only process text messages.',
          parseMode: 'Markdown'
        },
        error: {
          code: 'INVALID_MESSAGE_TYPE',
          message: 'Only text messages are supported'
        }
      };
    }

    try {
      // Parse the command
      const parseResult = this.parser.parseCommand(message.text, context);
      
      // Check if parsing failed
      if ('code' in parseResult) {
        return {
          success: false,
          response: this.formatErrorResponse(parseResult),
          error: parseResult
        };
      }

      // Validate the parsed command
      const validationError = this.parser.validateCommand(parseResult);
      if (validationError) {
        return {
          success: false,
          response: this.formatErrorResponse(validationError),
          error: validationError
        };
      }

      // Check permissions
      const permissionError = this.validatePermissions(parseResult);
      if (permissionError) {
        return {
          success: false,
          response: this.formatErrorResponse(permissionError),
          error: permissionError
        };
      }

      // Execute the command
      return await this.executeCommand(parseResult);

    } catch (error) {
      console.error('[command-handler] Error handling message:', error);
      
      return {
        success: false,
        response: {
          text: '❌ **An error occurred**\n\nSorry, I encountered an unexpected error while processing your message. Please try again.',
          parseMode: 'Markdown'
        },
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  async executeCommand(command: ParsedCommand): Promise<CommandResult> {
    console.log(`[command-handler] Executing command: ${command.command} for user ${command.context.userId}`);

    try {
      // Update session data
      this.updateSessionData(command);

      // Route to specific command handler
      switch (command.command) {
        case '/help':
          return await this.handleHelpCommand(command);
        
        case '/projects':
          return await this.handleProjectsCommand(command);
        
        case '/select':
          return await this.handleSelectCommand(command);
        
        case '/context':
          return await this.handleContextCommand(command);
        
        case '/clear':
          return await this.handleClearCommand(command);
        
        case '/tasks':
          return await this.handleTasksCommand(command);
        
        case '/boards':
          return await this.handleBoardsCommand(command);
        
        case '/create':
          return await this.handleCreateCommand(command);
        
        case '/analytics':
          return await this.handleAnalyticsCommand(command);
        
        case '/reset':
          return await this.handleResetCommand(command);
        
        default:
          return {
            success: false,
            response: {
              text: `❌ **Unknown Command**\n\nI don't recognize the command \`${command.command}\`.\n\nUse \`/help\` to see available commands.`,
              parseMode: 'Markdown'
            },
            error: {
              code: 'UNKNOWN_COMMAND',
              message: `Command not recognized: ${command.command}`,
              suggestions: ['Use /help to see available commands']
            }
          };
      }

    } catch (error) {
      console.error(`[command-handler] Error executing ${command.command}:`, error);
      
      return {
        success: false,
        response: {
          text: `❌ **Command Failed**\n\nAn error occurred while executing \`${command.command}\`. Please try again.`,
          parseMode: 'Markdown'
        },
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown execution error'
        }
      };
    }
  }

  validatePermissions(command: ParsedCommand): CommandError | null {
    // Basic permission validation
    // TODO: Implement proper permission system based on user roles
    
    // For now, just check if context-dependent commands have context
    const contextRequiredCommands = ['/tasks', '/boards', '/analytics'];
    
    if (contextRequiredCommands.includes(command.command) && !command.context.activeProject) {
      return {
        code: 'MISSING_CONTEXT',
        message: `${command.command} requires an active project.`,
        suggestions: [
          'Use /projects to select a project',
          'Use /select <project> to select a specific project'
        ]
      };
    }

    return null;
  }

  // ── Command Handlers ──

  private async handleHelpCommand(command: ParsedCommand): Promise<CommandResult> {
    const specificCommand = command.args.positional[0];
    
    if (specificCommand) {
      const helpText = this.registry.getCommandHelp(specificCommand);
      return {
        success: true,
        response: {
          text: helpText,
          parseMode: 'Markdown'
        }
      };
    }

    // General help with interactive menu
    const response = this.uiGenerator.generateHelpMenu([
      'project-management',
      'task-management',
      'context-management',
      'analytics',
      'help'
    ] as any);

    return {
      success: true,
      response
    };
  }

  private async handleProjectsCommand(command: ParsedCommand): Promise<CommandResult> {
    const filter = command.args.positional[0];
    const page = parseInt(command.args.named.page || '1');
    
    // TODO: Integrate with actual project service
    // For now, return mock data
    const mockProjects = this.getMockProjects(filter);
    
    const response = this.uiGenerator.generateProjectList(mockProjects, {
      page,
      limit: 5,
      hasMore: mockProjects.length > 5,
      filter
    });

    return {
      success: true,
      response
    };
  }

  private async handleSelectCommand(command: ParsedCommand): Promise<CommandResult> {
    const projectIdentifier = command.args.positional[0];
    
    if (!projectIdentifier) {
      return {
        success: false,
        response: {
          text: '❌ **Missing Project**\n\nPlease specify which project to select.\n\n**Examples:**\n• `/select my-project`\n• `/select 123`\n• `/select "Project Name"`',
          parseMode: 'Markdown'
        },
        error: {
          code: 'MISSING_ARGUMENT',
          message: 'Project identifier is required'
        }
      };
    }

    // TODO: Integrate with actual project service
    // For now, simulate project selection
    const mockProject = this.getMockProject(projectIdentifier);
    
    if (!mockProject) {
      return {
        success: false,
        response: {
          text: `❌ **Project Not Found**\n\nCouldn't find project: \`${projectIdentifier}\`\n\nUse \`/projects\` to see available projects.`,
          parseMode: 'Markdown'
        },
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: `Project not found: ${projectIdentifier}`
        }
      };
    }

    // Create project context
    const projectContext: ProjectContext = {
      projectId: mockProject.id,
      projectName: mockProject.name,
      projectSlug: mockProject.name.toLowerCase().replace(/\s+/g, '-'),
      selectedAt: new Date(),
      boards: [],
      recentCards: [],
      permissions: mockProject.permissions
    };

    return {
      success: true,
      response: {
        text: `🎯 **Project Selected: ${mockProject.name}**\n\n${mockProject.description}\n\n**Quick Actions:**\n• \`/tasks\` - View tasks\n• \`/boards\` - View boards\n• \`/analytics\` - View analytics\n• \`/context\` - Manage project context`,
        parseMode: 'Markdown'
      },
      contextUpdate: projectContext
    };
  }

  private async handleContextCommand(command: ParsedCommand): Promise<CommandResult> {
    const response = this.uiGenerator.generateContextStatus(command.context.activeProject || null);
    
    return {
      success: true,
      response
    };
  }

  private async handleClearCommand(command: ParsedCommand): Promise<CommandResult> {
    return {
      success: true,
      response: {
        text: '✅ **Context Cleared**\n\nProject context has been cleared. You can now select a different project using `/projects`.',
        parseMode: 'Markdown'
      },
      contextUpdate: {} // This will clear the active project
    };
  }

  private async handleTasksCommand(command: ParsedCommand): Promise<CommandResult> {
    if (!command.context.activeProject) {
      return {
        success: false,
        response: {
          text: '❌ **No Active Project**\n\nPlease select a project first using `/projects`.',
          parseMode: 'Markdown'
        },
        error: {
          code: 'MISSING_CONTEXT',
          message: 'Active project required for tasks command'
        }
      };
    }

    // TODO: Integrate with actual task service
    const mockTasks = this.getMockTasks();
    
    const response = this.uiGenerator.generateTaskList(mockTasks, {
      page: 1,
      limit: 8,
      hasMore: false,
      boardName: command.args.positional[0]
    });

    return {
      success: true,
      response
    };
  }

  private async handleBoardsCommand(command: ParsedCommand): Promise<CommandResult> {
    if (!command.context.activeProject) {
      return {
        success: false,
        response: {
          text: '❌ **No Active Project**\n\nPlease select a project first using `/projects`.',
          parseMode: 'Markdown'
        },
        error: {
          code: 'MISSING_CONTEXT',
          message: 'Active project required for boards command'
        }
      };
    }

    // TODO: Integrate with actual board service
    return {
      success: true,
      response: {
        text: `📋 **Boards in ${command.context.activeProject.projectName}**\n\n• 📋 Backlog (5 tasks)\n• 🔄 In Progress (3 tasks)\n• 👀 Review (2 tasks)\n• ✅ Done (12 tasks)\n\nUse \`/tasks <board_name>\` to view tasks in a specific board.`,
        parseMode: 'Markdown'
      }
    };
  }

  private async handleCreateCommand(command: ParsedCommand): Promise<CommandResult> {
    const itemType = command.args.positional[0];
    const itemName = command.args.positional[1];
    
    if (!itemType || !itemName) {
      return {
        success: false,
        response: {
          text: '❌ **Missing Information**\n\nPlease specify what to create and its name.\n\n**Examples:**\n• `/create project "My Project"`\n• `/create task "Fix bug"`\n• `/create board "Development"`',
          parseMode: 'Markdown'
        },
        error: {
          code: 'MISSING_ARGUMENT',
          message: 'Item type and name are required'
        }
      };
    }

    // TODO: Integrate with actual creation services
    return {
      success: true,
      response: {
        text: `✅ **${itemType.charAt(0).toUpperCase() + itemType.slice(1)} Created**\n\n"${itemName}" has been created successfully.\n\n_Note: Creation functionality is not yet fully implemented._`,
        parseMode: 'Markdown'
      }
    };
  }

  private async handleAnalyticsCommand(command: ParsedCommand): Promise<CommandResult> {
    if (!command.context.activeProject) {
      return {
        success: false,
        response: {
          text: '❌ **No Active Project**\n\nPlease select a project first using `/projects`.',
          parseMode: 'Markdown'
        },
        error: {
          code: 'MISSING_CONTEXT',
          message: 'Active project required for analytics command'
        }
      };
    }

    // TODO: Integrate with actual analytics service
    return {
      success: true,
      response: {
        text: `📊 **Analytics for ${command.context.activeProject.projectName}**\n\n**This Week:**\n• 🆕 5 tasks created\n• ✅ 8 tasks completed\n• 🔄 3 tasks in progress\n• ⏱️ Avg completion time: 2.3 days\n\n**Team Velocity:**\n• 📈 +15% vs last week\n• 🎯 85% on-time delivery\n\n_Note: Full analytics not yet implemented._`,
        parseMode: 'Markdown'
      }
    };
  }

  private async handleResetCommand(command: ParsedCommand): Promise<CommandResult> {
    return {
      success: true,
      response: {
        text: '🔄 **Bot Reset**\n\nAll context and session data has been cleared. You can start fresh!\n\nUse `/help` to see available commands or `/projects` to select a project.',
        parseMode: 'Markdown'
      },
      contextUpdate: {} // This will clear all context
    };
  }

  // ── Helper Methods ──

  private updateSessionData(command: ParsedCommand): void {
    const session = command.context.session;
    session.lastActivity = new Date();
    session.commandHistory.push(command.rawInput);
    
    // Keep only last 10 commands
    if (session.commandHistory.length > 10) {
      session.commandHistory = session.commandHistory.slice(-10);
    }
  }

  private formatErrorResponse(error: CommandError): UIResponse {
    let text = `❌ **${this.getErrorTitle(error.code)}**\n\n${error.message}`;
    
    if (error.suggestions && error.suggestions.length > 0) {
      text += '\n\n**Suggestions:**\n';
      text += error.suggestions.map(s => `• ${s}`).join('\n');
    }

    return {
      text,
      parseMode: 'Markdown'
    };
  }

  private getErrorTitle(code: string): string {
    switch (code) {
      case 'EMPTY_COMMAND': return 'Empty Command';
      case 'INVALID_COMMAND': return 'Invalid Command';
      case 'INVALID_FORMAT': return 'Invalid Format';
      case 'MISSING_ARGUMENT': return 'Missing Argument';
      case 'INVALID_ARGUMENT': return 'Invalid Argument';
      case 'MISSING_CONTEXT': return 'No Active Project';
      case 'PROJECT_NOT_FOUND': return 'Project Not Found';
      case 'UNKNOWN_COMMAND': return 'Unknown Command';
      case 'EXECUTION_ERROR': return 'Command Failed';
      case 'INTERNAL_ERROR': return 'Internal Error';
      default: return 'Error';
    }
  }

  // ── Mock Data Methods (TODO: Replace with real integrations) ──

  private getMockProjects(filter?: string): any[] {
    const projects = [
      {
        id: '1',
        name: 'Website Redesign',
        description: 'Complete overhaul of company website',
        status: 'active',
        boardCount: 4,
        cardCount: 23,
        lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        isSelected: false,
        permissions: { canRead: true, canWrite: true, canDelete: false, canManage: true }
      },
      {
        id: '2', 
        name: 'Mobile App',
        description: 'iOS and Android mobile application',
        status: 'active',
        boardCount: 3,
        cardCount: 15,
        lastActivity: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        isSelected: false,
        permissions: { canRead: true, canWrite: true, canDelete: true, canManage: true }
      }
    ];

    if (filter) {
      return projects.filter(p => 
        p.name.toLowerCase().includes(filter.toLowerCase()) ||
        p.description.toLowerCase().includes(filter.toLowerCase())
      );
    }

    return projects;
  }

  private getMockProject(identifier: string): any | null {
    const projects = this.getMockProjects();
    return projects.find(p => 
      p.id === identifier || 
      p.name.toLowerCase() === identifier.toLowerCase() ||
      p.name.toLowerCase().includes(identifier.toLowerCase())
    ) || null;
  }

  private getMockTasks(): any[] {
    return [
      {
        id: '1',
        title: 'Design homepage layout',
        description: 'Create wireframes and mockups for new homepage',
        priority: 'high',
        status: 'in_progress',
        type: 'task',
        boardName: 'Design',
        columnName: 'In Progress',
        assignee: 'John Doe',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        tags: ['design', 'homepage']
      },
      {
        id: '2',
        title: 'Fix mobile navigation bug',
        description: 'Navigation menu not working on mobile devices',
        priority: 'urgent',
        status: 'todo',
        type: 'bug',
        boardName: 'Development',
        columnName: 'To Do',
        assignee: 'Jane Smith',
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
        tags: ['bug', 'mobile', 'navigation']
      }
    ];
  }
}