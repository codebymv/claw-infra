import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { ChatSessionService } from './chat-session.service';
import { MessageSource, MessageType } from '../database/entities';
import { Project } from '../database/entities/project.entity';

export interface WebCommandContext {
  userId: string;
  sessionId?: string;
  activeProjectId?: string;
  source: 'web' | 'telegram';
  metadata?: Record<string, any>;
}

export interface WebCommandResult {
  success: boolean;
  response: {
    content: string;
    type: 'text' | 'markdown' | 'html';
    metadata?: Record<string, any>;
  };
  error?: {
    code: string;
    message: string;
    suggestions?: string[];
  };
  contextUpdate?: {
    activeProjectId?: string;
    metadata?: Record<string, any>;
  };
}

export interface ParsedWebCommand {
  command: string;
  args: {
    positional: string[];
    named: Record<string, string>;
  };
  rawInput: string;
  context: WebCommandContext;
}

@Injectable()
export class WebCommandHandlerService {
  private readonly logger = new Logger(WebCommandHandlerService.name);

  constructor(
    private readonly chatSessionService: ChatSessionService,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
  ) {}

  /**
   * Handle a message from web chat interface
   */
  async handleWebMessage(
    content: string,
    context: WebCommandContext
  ): Promise<WebCommandResult> {
    this.logger.log(`Processing web message: "${content}" from user ${context.userId}`);

    try {
      // Record the message in chat session
      await this.chatSessionService.addMessage(context.userId, {
        content,
        source: MessageSource.WEB,
        type: content.startsWith('/') ? MessageType.COMMAND : MessageType.MESSAGE,
        projectId: context.activeProjectId,
        metadata: context.metadata || {},
      });

      // Check if it's a command
      if (content.startsWith('/')) {
        const parsedCommand = this.parseCommand(content, context);
        return await this.executeWebCommand(parsedCommand);
      } else {
        // Handle regular messages (could be forwarded to AI or other processing)
        return await this.handleRegularMessage(content, context);
      }
    } catch (error) {
      this.logger.error('Error handling web message:', error);
      
      return {
        success: false,
        response: {
          content: 'An error occurred while processing your message. Please try again.',
          type: 'text',
        },
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Execute a parsed web command
   */
  async executeWebCommand(command: ParsedWebCommand): Promise<WebCommandResult> {
    this.logger.log(`Executing web command: ${command.command} for user ${command.context.userId}`);

    try {
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
        
        case '/status':
          return await this.handleStatusCommand(command);
        
        case '/history':
          return await this.handleHistoryCommand(command);
        
        case '/search':
          return await this.handleSearchCommand(command);
        
        default:
          return await this.handleUnknownCommand(command);
      }
    } catch (error) {
      this.logger.error(`Error executing web command ${command.command}:`, error);
      
      return {
        success: false,
        response: {
          content: `An error occurred while executing \`${command.command}\`. Please try again.`,
          type: 'markdown',
        },
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown execution error',
        },
      };
    }
  }

  /**
   * Parse a command string into structured format
   */
  private parseCommand(input: string, context: WebCommandContext): ParsedWebCommand {
    const trimmed = input.trim();
    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Parse named arguments (--key=value or --key value)
    const named: Record<string, string> = {};
    const positional: string[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (value !== undefined) {
          named[key] = value;
        } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          named[key] = args[i + 1];
          i++; // Skip next argument as it's the value
        } else {
          named[key] = 'true';
        }
      } else {
        positional.push(arg);
      }
    }

    return {
      command,
      args: { positional, named },
      rawInput: input,
      context,
    };
  }

  /**
   * Handle regular (non-command) messages
   */
  private async handleRegularMessage(
    content: string,
    context: WebCommandContext
  ): Promise<WebCommandResult> {
    // For now, just echo back with a helpful message
    // In the future, this could be forwarded to AI processing
    
    return {
      success: true,
      response: {
        content: `I received your message: "${content}"\n\nI'm a command-based bot. Try typing \`/help\` to see available commands.`,
        type: 'markdown',
      },
    };
  }

  // ── Command Handlers ──

  private async handleHelpCommand(command: ParsedWebCommand): Promise<WebCommandResult> {
    const helpContent = `# Available Commands

## Project Management
- \`/projects\` — List all available projects
- \`/select <project>\` — Select a project to work with
- \`/context\` — Show current project context
- \`/clear\` — Clear current project context

## Chat Management
- \`/status\` — Show chat session status
- \`/history [limit]\` — Show recent message history
- \`/search <query>\` — Search through message history
- \`/help [command]\` — Show this help

## Examples
\`\`\`
/projects              List all projects
/select my-project     Select project by name
/history 20            Show last 20 messages
/search deploy error   Find messages about deploy errors
\`\`\`

Type any command to execute it. Use the project selector in the header to quickly switch projects.`;

    return {
      success: true,
      response: {
        content: helpContent,
        type: 'markdown',
      },
    };
  }

  private async handleProjectsCommand(command: ParsedWebCommand): Promise<WebCommandResult> {
    const projects = await this.projectRepo.find({
      where: { status: 'active' as any },
      relations: ['boards'],
      order: { updatedAt: 'DESC' },
      take: 20,
    });

    if (projects.length === 0) {
      return {
        success: true,
        response: {
          content: '## No Projects Found\n\nNo active projects yet. Create one from the **Projects** page.',
          type: 'markdown',
        },
      };
    }

    const lines = projects.map((p, i) => {
      const boardCount = p.boards?.length ?? 0;
      return `${i + 1}. **${p.name}** — ${p.description || 'No description'}\n   - Boards: ${boardCount} • Updated: ${p.updatedAt.toLocaleDateString()}`;
    });

    const projectsContent = `# Available Projects\n\n${lines.join('\n\n')}\n\nUse \`/select <project-name>\` to select a project.`;

    return {
      success: true,
      response: {
        content: projectsContent,
        type: 'markdown',
      },
    };
  }

  private async handleSelectCommand(command: ParsedWebCommand): Promise<WebCommandResult> {
    const projectIdentifier = command.args.positional.join(' ');
    
    if (!projectIdentifier) {
      return {
        success: false,
        response: {
          content: 'Please specify which project to select.\n\n**Examples:**\n- `/select my-project`\n- `/select "Project Name"`',
          type: 'markdown',
        },
        error: {
          code: 'MISSING_ARGUMENT',
          message: 'Project identifier is required',
        },
      };
    }

    // Look up project by name (case-insensitive) or by ID
    let project = await this.projectRepo.findOne({
      where: [
        { id: projectIdentifier },
        { name: ILike(projectIdentifier) },
      ],
    });

    // If not found, try partial match
    if (!project) {
      project = await this.projectRepo.findOne({
        where: { name: ILike(`%${projectIdentifier}%`) },
      });
    }

    if (!project) {
      return {
        success: false,
        response: {
          content: `No project found matching **"${projectIdentifier}"**.\n\nUse \`/projects\` to see available projects.`,
          type: 'markdown',
        },
        error: {
          code: 'NOT_FOUND',
          message: 'Project not found',
        },
      };
    }

    await this.chatSessionService.setActiveProject(command.context.userId, project.id);

    return {
      success: true,
      response: {
        content: `✅ **Project Selected**\n\nYou've selected: **${project.name}**\n${project.description ? `> ${project.description}\n` : ''}\nAgent runs will now be linked to this project. Use \`/context\` to verify.`,
        type: 'markdown',
      },
      contextUpdate: {
        activeProjectId: project.id,
      },
    };
  }

  private async handleContextCommand(command: ParsedWebCommand): Promise<WebCommandResult> {
    const session = await this.chatSessionService.getSession(command.context.userId);
    
    if (!session) {
      return {
        success: false,
        response: {
          content: 'No active chat session found.',
          type: 'text',
        },
        error: {
          code: 'NO_SESSION',
          message: 'Chat session not found',
        },
      };
    }

    let projectLine = '**Active Project:** None';
    if (session.activeProjectId) {
      const project = await this.projectRepo.findOne({
        where: { id: session.activeProjectId },
      });
      projectLine = project
        ? `**Active Project:** ${project.name} (\`${project.id}\`)`
        : `**Active Project:** ${session.activeProjectId} (unknown)`;
    }

    const contextContent = `# Current Context

**User ID:** ${session.userId}
${projectLine}
**Session Created:** ${session.createdAt.toLocaleString()}
**Last Activity:** ${session.lastActivity.toLocaleString()}
**Message Count:** ${session.messageCount}

**Preferences:**
- Auto-complete: ${session.preferences.autoComplete ? '✅' : '❌'}
- Show timestamps: ${session.preferences.showTimestamps ? '✅' : '❌'}
- Markdown enabled: ${session.preferences.markdownEnabled ? '✅' : '❌'}
- Cross-platform sync: ${session.preferences.crossPlatformSync ? '✅' : '❌'}`;

    return {
      success: true,
      response: {
        content: contextContent,
        type: 'markdown',
      },
    };
  }

  private async handleClearCommand(command: ParsedWebCommand): Promise<WebCommandResult> {
    await this.chatSessionService.setActiveProject(command.context.userId, null);

    return {
      success: true,
      response: {
        content: '✅ **Context Cleared**\n\nProject context has been cleared. You can now select a different project using `/projects`.',
        type: 'markdown',
      },
      contextUpdate: {
        activeProjectId: undefined,
      },
    };
  }

  private async handleStatusCommand(command: ParsedWebCommand): Promise<WebCommandResult> {
    try {
      const stats = await this.chatSessionService.getSessionStats(command.context.userId);
      
      const statusContent = `# Chat Session Status

**Messages:** ${stats.messageCount}
**Last Activity:** ${stats.lastActivity.toLocaleString()}
**Active Project:** ${stats.activeProject || 'None'}
**Session Created:** ${stats.createdAt.toLocaleString()}

**Connection:** ✅ Connected
**Platform:** Web Chat`;

      return {
        success: true,
        response: {
          content: statusContent,
          type: 'markdown',
        },
      };
    } catch (error) {
      return {
        success: false,
        response: {
          content: 'Unable to retrieve session status.',
          type: 'text',
        },
        error: {
          code: 'STATUS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  private async handleHistoryCommand(command: ParsedWebCommand): Promise<WebCommandResult> {
    const limit = parseInt(command.args.positional[0] || '10');
    
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return {
        success: false,
        response: {
          content: 'Please provide a valid limit between 1 and 100.',
          type: 'text',
        },
        error: {
          code: 'INVALID_ARGUMENT',
          message: 'Limit must be between 1 and 100',
        },
      };
    }

    const messages = await this.chatSessionService.getMessageHistory(command.context.userId, limit);
    
    if (messages.length === 0) {
      return {
        success: true,
        response: {
          content: 'No message history found.',
          type: 'text',
        },
      };
    }

    const historyContent = `# Message History (Last ${messages.length} messages)

${messages.reverse().map((msg, index) => {
      const timestamp = msg.timestamp.toLocaleTimeString();
      const source = msg.source === MessageSource.WEB ? '🌐' : '📱';
      const type = msg.type === MessageType.COMMAND ? '⚡' : '💬';
      
      return `${index + 1}. ${source} ${type} **${timestamp}** - ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`;
    }).join('\n\n')}`;

    return {
      success: true,
      response: {
        content: historyContent,
        type: 'markdown',
      },
    };
  }

  private async handleSearchCommand(command: ParsedWebCommand): Promise<WebCommandResult> {
    const query = command.args.positional.join(' ');

    if (!query) {
      return {
        success: false,
        response: {
          content: 'Please provide a search term.\n\n**Usage:** `/search <query>`\n**Example:** `/search deploy error`',
          type: 'markdown',
        },
        error: {
          code: 'MISSING_ARGUMENT',
          message: 'Search query is required',
        },
      };
    }

    const messages = await this.chatSessionService.getMessageHistory(
      command.context.userId,
      200,
    );

    const queryLower = query.toLowerCase();
    const matches = messages.filter(m =>
      m.content.toLowerCase().includes(queryLower),
    );

    if (matches.length === 0) {
      return {
        success: true,
        response: {
          content: `No messages found matching **"${query}"**.`,
          type: 'markdown',
        },
      };
    }

    const results = matches.slice(0, 10).map((m, i) => {
      const time = m.timestamp.toLocaleString();
      const preview = m.content.length > 100
        ? m.content.substring(0, 100) + '...'
        : m.content;
      return `${i + 1}. \`${time}\` — ${preview}`;
    });

    return {
      success: true,
      response: {
        content: `# Search Results for "${query}"\n\nFound **${matches.length}** match${matches.length === 1 ? '' : 'es'}${matches.length > 10 ? ' (showing first 10)' : ''}:\n\n${results.join('\n\n')}`,
        type: 'markdown',
      },
    };
  }

  private async handleUnknownCommand(command: ParsedWebCommand): Promise<WebCommandResult> {
    return {
      success: false,
      response: {
        content: `❌ **Unknown Command**\n\nI don't recognize the command \`${command.command}\`.\n\nUse \`/help\` to see available commands.`,
        type: 'markdown',
      },
      error: {
        code: 'UNKNOWN_COMMAND',
        message: `Command not recognized: ${command.command}`,
        suggestions: ['Use /help to see available commands'],
      },
    };
  }
}