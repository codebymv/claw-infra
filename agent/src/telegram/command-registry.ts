import { ITelegramBotHandler } from './telegram-bot-handler';
import { BotCommand } from './types';
import { BotCommandDefinition, CommandMetadata, CommandCategory } from './models';

/**
 * Command Registry interface for managing bot commands
 */
export interface ICommandRegistry {
  // Initialization
  initialize(): Promise<void>;
  
  // Command registration
  registerCommand(command: BotCommandDefinition): Promise<void>;
  registerCommands(commands: BotCommandDefinition[]): Promise<void>;
  updateCommandDescriptions(): Promise<void>;
  
  // Command discovery
  getRegisteredCommands(): BotCommandDefinition[];
  getCommandHelp(commandName?: string): string;
  
  // Command validation
  isValidCommand(command: string): boolean;
  getCommandMetadata(command: string): CommandMetadata | null;
}

/**
 * Command Registry implementation
 */
export class CommandRegistry implements ICommandRegistry {
  private commands: Map<string, BotCommandDefinition> = new Map();
  private aliases: Map<string, string> = new Map(); // alias -> primary command
  private botHandler: ITelegramBotHandler;
  private isInitialized: boolean = false;

  constructor(botHandler: ITelegramBotHandler) {
    this.botHandler = botHandler;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Register default commands
    await this.registerDefaultCommands();
    
    // Update Telegram with registered commands
    await this.updateCommandDescriptions();
    
    this.isInitialized = true;
    console.log('[command-registry] Initialized with default commands');
  }

  async registerCommand(command: BotCommandDefinition): Promise<void> {
    // Validate command format
    if (!command.command.startsWith('/')) {
      throw new Error(`Command must start with '/': ${command.command}`);
    }

    if (command.command.length < 2) {
      throw new Error(`Command too short: ${command.command}`);
    }

    // Store the command
    this.commands.set(command.command, command);

    // Register aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        const aliasCommand = alias.startsWith('/') ? alias : `/${alias}`;
        this.aliases.set(aliasCommand, command.command);
      }
    }

    console.log(`[command-registry] Registered command: ${command.command}`);
  }

  async registerCommands(commands: BotCommandDefinition[]): Promise<void> {
    for (const command of commands) {
      await this.registerCommand(command);
    }
  }

  async updateCommandDescriptions(): Promise<void> {
    const telegramCommands: BotCommand[] = Array.from(this.commands.values())
      .map(cmd => ({
        command: cmd.command.substring(1), // Remove leading '/'
        description: cmd.description
      }));

    try {
      await this.botHandler.setMyCommands(telegramCommands);
      console.log(`[command-registry] Updated ${telegramCommands.length} commands with Telegram`);
    } catch (error) {
      console.error('[command-registry] Failed to update commands with Telegram:', error);
      throw error;
    }
  }

  getRegisteredCommands(): BotCommandDefinition[] {
    return Array.from(this.commands.values());
  }

  getCommandHelp(commandName?: string): string {
    if (commandName) {
      const command = this.resolveCommand(commandName);
      if (!command) {
        return `❌ Command not found: ${commandName}`;
      }

      const metadata = this.getCommandMetadata(command.command);
      if (!metadata) {
        return `📋 **${command.command}**\n${command.description}`;
      }

      let help = `📋 **${command.command}**\n${command.description}\n\n`;
      help += `**Syntax:** ${metadata.syntax}\n\n`;
      
      if (metadata.examples.length > 0) {
        help += `**Examples:**\n${metadata.examples.map(ex => `• ${ex}`).join('\n')}\n\n`;
      }

      if (metadata.contextRequired) {
        help += `⚠️ *Requires active project context*\n`;
      }

      return help;
    }

    // Return categorized help
    const categories = this.groupCommandsByCategory();
    let help = '🤖 **Available Commands**\n\n';

    for (const [category, commands] of categories) {
      help += `**${this.getCategoryDisplayName(category)}**\n`;
      for (const command of commands) {
        help += `• ${command.command} - ${command.description}\n`;
      }
      help += '\n';
    }

    help += 'Use `/help <command>` for detailed information about a specific command.';
    return help;
  }

  isValidCommand(command: string): boolean {
    const normalizedCommand = command.startsWith('/') ? command : `/${command}`;
    return this.commands.has(normalizedCommand) || this.aliases.has(normalizedCommand);
  }

  getCommandMetadata(command: string): CommandMetadata | null {
    const resolvedCommand = this.resolveCommand(command);
    if (!resolvedCommand) {
      return null;
    }

    // Generate metadata based on command definition
    return {
      syntax: this.generateSyntax(resolvedCommand),
      examples: this.generateExamples(resolvedCommand),
      permissions: [], // TODO: Implement permissions system
      contextRequired: resolvedCommand.requiresContext || false
    };
  }

  private async registerDefaultCommands(): Promise<void> {
    const defaultCommands: BotCommandDefinition[] = [
      {
        command: '/projects',
        description: 'Browse and select projects',
        category: CommandCategory.PROJECT_MANAGEMENT,
        aliases: ['proj', 'p']
      },
      {
        command: '/help',
        description: 'Show available commands and usage',
        category: CommandCategory.HELP,
        aliases: ['h', '?']
      },
      {
        command: '/context',
        description: 'View and manage current project context',
        category: CommandCategory.CONTEXT_MANAGEMENT,
        aliases: ['ctx', 'c']
      },
      {
        command: '/select',
        description: 'Select a project by name or ID',
        category: CommandCategory.PROJECT_MANAGEMENT,
        aliases: ['sel', 's']
      },
      {
        command: '/clear',
        description: 'Clear current project context',
        category: CommandCategory.CONTEXT_MANAGEMENT,
        aliases: ['clr']
      },
      {
        command: '/analytics',
        description: 'View project analytics and metrics',
        category: CommandCategory.ANALYTICS,
        requiresContext: true,
        aliases: ['stats', 'metrics']
      },
      {
        command: '/reset',
        description: 'Reset bot state and clear all context',
        category: CommandCategory.CONTEXT_MANAGEMENT
      },
      {
        command: '/boards',
        description: 'List boards in current project',
        category: CommandCategory.TASK_MANAGEMENT,
        requiresContext: true,
        aliases: ['b']
      },
      {
        command: '/tasks',
        description: 'List tasks in current project or board',
        category: CommandCategory.TASK_MANAGEMENT,
        requiresContext: true,
        aliases: ['t']
      },
      {
        command: '/create',
        description: 'Create new project, board, or task',
        category: CommandCategory.PROJECT_MANAGEMENT,
        aliases: ['new', 'add']
      }
    ];

    await this.registerCommands(defaultCommands);
  }

  private resolveCommand(command: string): BotCommandDefinition | null {
    const normalizedCommand = command.startsWith('/') ? command : `/${command}`;
    
    // Check direct command
    if (this.commands.has(normalizedCommand)) {
      return this.commands.get(normalizedCommand)!;
    }

    // Check aliases
    if (this.aliases.has(normalizedCommand)) {
      const primaryCommand = this.aliases.get(normalizedCommand)!;
      return this.commands.get(primaryCommand)!;
    }

    return null;
  }

  private groupCommandsByCategory(): Map<CommandCategory, BotCommandDefinition[]> {
    const categories = new Map<CommandCategory, BotCommandDefinition[]>();

    for (const command of this.commands.values()) {
      const category = command.category || CommandCategory.HELP;
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(command);
    }

    // Sort commands within each category
    for (const commands of categories.values()) {
      commands.sort((a, b) => a.command.localeCompare(b.command));
    }

    return categories;
  }

  private getCategoryDisplayName(category: CommandCategory): string {
    switch (category) {
      case CommandCategory.PROJECT_MANAGEMENT:
        return '📁 Project Management';
      case CommandCategory.TASK_MANAGEMENT:
        return '✅ Task Management';
      case CommandCategory.CONTEXT_MANAGEMENT:
        return '🎯 Context Management';
      case CommandCategory.ANALYTICS:
        return '📊 Analytics';
      case CommandCategory.HELP:
        return '❓ Help & Information';
      default:
        return '🔧 Other';
    }
  }

  private generateSyntax(command: BotCommandDefinition): string {
    switch (command.command) {
      case '/projects':
        return '/projects [filter]';
      case '/select':
        return '/select <project_name_or_id>';
      case '/help':
        return '/help [command]';
      case '/analytics':
        return '/analytics [timeframe]';
      case '/boards':
        return '/boards [filter]';
      case '/tasks':
        return '/tasks [board] [status] [priority]';
      case '/create':
        return '/create <type> <name> [description]';
      default:
        return command.command;
    }
  }

  private generateExamples(command: BotCommandDefinition): string[] {
    switch (command.command) {
      case '/projects':
        return [
          '/projects',
          '/projects active',
          '/projects my-project'
        ];
      case '/select':
        return [
          '/select my-project',
          '/select 123',
          '/select "Project Name"'
        ];
      case '/help':
        return [
          '/help',
          '/help projects',
          '/help create'
        ];
      case '/analytics':
        return [
          '/analytics',
          '/analytics week',
          '/analytics month'
        ];
      case '/boards':
        return [
          '/boards',
          '/boards development'
        ];
      case '/tasks':
        return [
          '/tasks',
          '/tasks backlog',
          '/tasks todo high'
        ];
      case '/create':
        return [
          '/create project "New Project"',
          '/create board "Development"',
          '/create task "Fix bug" "Description here"'
        ];
      default:
        return [command.command];
    }
  }
}