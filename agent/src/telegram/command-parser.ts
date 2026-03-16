import {
  ParsedCommand,
  CommandArguments,
  UserContext,
  CommandError
} from './models';

/**
 * Command Parser interface for parsing both slash commands and natural language
 */
export interface ICommandParser {
  parseCommand(input: string, context: UserContext): ParsedCommand | CommandError;
  validateCommand(command: ParsedCommand): CommandError | null;
  extractArguments(input: string): CommandArguments;
}

/**
 * Command Parser implementation with dual parsing support
 */
export class CommandParser implements ICommandParser {
  private readonly slashCommandRegex = /^\/([a-zA-Z_][a-zA-Z0-9_]*)\s*(.*)?$/;
  private readonly naturalLanguagePatterns: Map<RegExp, string> = new Map();

  constructor() {
    this.initializeNaturalLanguagePatterns();
  }

  parseCommand(input: string, context: UserContext): ParsedCommand | CommandError {
    const trimmedInput = input.trim();
    
    if (!trimmedInput) {
      return {
        code: 'EMPTY_COMMAND',
        message: 'Please enter a command or message.',
        suggestions: ['Try /help to see available commands']
      };
    }

    // Try parsing as slash command first
    const slashMatch = this.slashCommandRegex.exec(trimmedInput);
    if (slashMatch) {
      return this.parseSlashCommand(slashMatch, trimmedInput, context);
    }

    // Try parsing as natural language
    const naturalCommand = this.parseNaturalLanguage(trimmedInput, context);
    if (naturalCommand) {
      return naturalCommand;
    }

    // If no pattern matches, treat as general query
    return {
      command: '/help',
      args: {
        positional: [trimmedInput],
        named: {},
        flags: []
      },
      rawInput: trimmedInput,
      isSlashCommand: false,
      context
    };
  }

  validateCommand(command: ParsedCommand): CommandError | null {
    // Basic validation
    if (!command.command) {
      return {
        code: 'INVALID_COMMAND',
        message: 'Command is required.',
        suggestions: []
      };
    }

    if (!command.command.startsWith('/')) {
      return {
        code: 'INVALID_FORMAT',
        message: 'Commands must start with "/".',
        suggestions: [`Try /${command.command} instead`]
      };
    }

    // Command-specific validation
    return this.validateSpecificCommand(command);
  }

  extractArguments(input: string): CommandArguments {
    const args: CommandArguments = {
      positional: [],
      named: {},
      flags: []
    };

    if (!input.trim()) {
      return args;
    }

    // Split input into tokens, respecting quoted strings
    const tokens = this.tokenize(input);
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      // Handle flags (--flag or -f)
      if (token.startsWith('--')) {
        const flagName = token.substring(2);
        if (flagName) {
          args.flags.push(flagName);
        }
        continue;
      }
      
      if (token.startsWith('-') && token.length > 1) {
        const flagName = token.substring(1);
        args.flags.push(flagName);
        continue;
      }
      
      // Handle named arguments (key=value or key:value)
      if (token.includes('=') || token.includes(':')) {
        const separator = token.includes('=') ? '=' : ':';
        const [key, ...valueParts] = token.split(separator);
        if (key && valueParts.length > 0) {
          args.named[key] = valueParts.join(separator);
          continue;
        }
      }
      
      // Everything else is positional
      args.positional.push(token);
    }

    return args;
  }

  private parseSlashCommand(match: RegExpExecArray, input: string, context: UserContext): ParsedCommand {
    const [, commandName, argsString] = match;
    const command = `/${commandName}`;
    const args = this.extractArguments(argsString || '');

    return {
      command,
      args,
      rawInput: input,
      isSlashCommand: true,
      context
    };
  }

  private parseNaturalLanguage(input: string, context: UserContext): ParsedCommand | null {
    const lowerInput = input.toLowerCase();
    
    for (const [pattern, command] of this.naturalLanguagePatterns.entries()) {
      const match = pattern.exec(lowerInput);
      if (match) {
        return this.createNaturalLanguageCommand(command, match, input, context);
      }
    }

    return null;
  }

  private createNaturalLanguageCommand(
    command: string, 
    match: RegExpExecArray, 
    originalInput: string, 
    context: UserContext
  ): ParsedCommand {
    const args: CommandArguments = {
      positional: [],
      named: {},
      flags: []
    };

    // Extract captured groups as positional arguments
    for (let i = 1; i < match.length; i++) {
      if (match[i]) {
        args.positional.push(match[i].trim());
      }
    }

    return {
      command,
      args,
      rawInput: originalInput,
      isSlashCommand: false,
      context
    };
  }

  private validateSpecificCommand(command: ParsedCommand): CommandError | null {
    switch (command.command) {
      case '/select':
        if (command.args.positional.length === 0) {
          return {
            code: 'MISSING_ARGUMENT',
            message: 'Please specify a project name or ID to select.',
            suggestions: [
              '/select my-project',
              '/select 123',
              '/select "Project Name"'
            ]
          };
        }
        break;

      case '/create':
        if (command.args.positional.length < 2) {
          return {
            code: 'MISSING_ARGUMENT',
            message: 'Please specify what to create and its name.',
            suggestions: [
              '/create project "My Project"',
              '/create task "Task Name"',
              '/create board "Board Name"'
            ]
          };
        }
        
        const itemType = command.args.positional[0];
        if (!['project', 'task', 'board'].includes(itemType)) {
          return {
            code: 'INVALID_ARGUMENT',
            message: `Invalid item type: ${itemType}`,
            suggestions: [
              'Valid types: project, task, board'
            ]
          };
        }
        break;

      case '/analytics':
        // Context-dependent validation
        if (!command.context.activeProject) {
          return {
            code: 'MISSING_CONTEXT',
            message: 'Analytics requires an active project. Please select a project first.',
            suggestions: [
              'Use /projects to select a project',
              'Use /select <project> to select a specific project'
            ]
          };
        }
        break;

      case '/tasks':
      case '/boards':
        // Context-dependent validation
        if (!command.context.activeProject) {
          return {
            code: 'MISSING_CONTEXT',
            message: `${command.command.substring(1)} requires an active project. Please select a project first.`,
            suggestions: [
              'Use /projects to select a project',
              'Use /select <project> to select a specific project'
            ]
          };
        }
        break;
    }

    return null;
  }

  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      
      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
        continue;
      }
      
      if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
        continue;
      }
      
      if (!inQuotes && /\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }
      
      current += char;
    }
    
    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  private initializeNaturalLanguagePatterns(): void {
    // Project selection patterns
    this.naturalLanguagePatterns.set(
      /(?:show|list|view|see)\s+(?:my\s+)?projects?/,
      '/projects'
    );
    
    this.naturalLanguagePatterns.set(
      /(?:select|choose|switch\s+to)\s+project\s+(.+)/,
      '/select'
    );

    // Task management patterns
    this.naturalLanguagePatterns.set(
      /(?:show|list|view|see)\s+(?:my\s+)?tasks?/,
      '/tasks'
    );
    
    this.naturalLanguagePatterns.set(
      /(?:create|add|new)\s+task\s+(.+)/,
      '/create'
    );

    // Board management patterns
    this.naturalLanguagePatterns.set(
      /(?:show|list|view|see)\s+(?:my\s+)?boards?/,
      '/boards'
    );

    // Context management patterns
    this.naturalLanguagePatterns.set(
      /(?:what|which)\s+project\s+(?:am\s+i\s+in|is\s+active|is\s+selected)/,
      '/context'
    );
    
    this.naturalLanguagePatterns.set(
      /(?:clear|reset|remove)\s+(?:project\s+)?context/,
      '/clear'
    );

    // Help patterns
    this.naturalLanguagePatterns.set(
      /(?:help|what\s+can\s+you\s+do|commands?|how\s+to)/,
      '/help'
    );

    // Analytics patterns
    this.naturalLanguagePatterns.set(
      /(?:show|view|see)\s+(?:project\s+)?(?:analytics|stats|statistics|metrics)/,
      '/analytics'
    );

    // Creation patterns
    this.naturalLanguagePatterns.set(
      /(?:create|add|new)\s+project\s+(.+)/,
      '/create'
    );

    console.log(`[command-parser] Initialized ${this.naturalLanguagePatterns.size} natural language patterns`);
  }
}