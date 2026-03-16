import {
  CallbackAction,
  CallbackResult,
  CallbackHandlerFunction,
  UserContext,
  ProjectContext,
  UIResponse
} from './models';
import { TelegramCallbackQuery } from './types';
import { IUIResponseGenerator } from './ui-response-generator';

/**
 * Callback Handler interface for processing button interactions
 */
export interface ICallbackHandler {
  // Callback processing
  handleCallback(query: TelegramCallbackQuery, context: UserContext): Promise<CallbackResult>;
  
  // Callback data management
  encodeCallbackData(action: CallbackAction): string;
  decodeCallbackData(data: string): CallbackAction | null;
  
  // Callback routing
  registerCallbackHandler(pattern: string, handler: CallbackHandlerFunction): void;
  routeCallback(action: CallbackAction, context: UserContext): Promise<CallbackResult>;
}

/**
 * Callback Handler implementation
 */
export class CallbackHandler implements ICallbackHandler {
  private handlers: Map<string, CallbackHandlerFunction> = new Map();
  private uiGenerator: IUIResponseGenerator;

  constructor(uiGenerator: IUIResponseGenerator) {
    this.uiGenerator = uiGenerator;
    this.registerDefaultHandlers();
  }

  async handleCallback(query: TelegramCallbackQuery, context: UserContext): Promise<CallbackResult> {
    if (!query.data) {
      return {
        notification: 'Invalid callback data',
        updateMessage: false
      };
    }

    try {
      const action = this.decodeCallbackData(query.data);
      if (!action) {
        return {
          notification: 'Invalid callback format',
          updateMessage: false
        };
      }

      // Add query context to action
      action.userId = query.from.id.toString();
      action.chatId = query.message?.chat.id.toString() || context.chatId;

      const result = await this.routeCallback(action, context);
      
      console.log(`[callback-handler] Processed callback: ${action.type} for user ${action.userId}`);
      return result;

    } catch (error) {
      console.error('[callback-handler] Error processing callback:', error);
      return {
        notification: 'An error occurred processing your request',
        updateMessage: false
      };
    }
  }

  encodeCallbackData(action: CallbackAction): string {
    try {
      // Create a compact representation
      const compact = {
        t: action.type,
        d: action.data
      };
      
      const encoded = JSON.stringify(compact);
      
      // Telegram callback data limit is 64 bytes
      if (encoded.length > 64) {
        console.warn(`[callback-handler] Callback data too long (${encoded.length} bytes), truncating`);
        return encoded.substring(0, 64);
      }
      
      return encoded;
    } catch (error) {
      console.error('[callback-handler] Error encoding callback data:', error);
      return 'error';
    }
  }

  decodeCallbackData(data: string): CallbackAction | null {
    try {
      // Handle special cases
      if (data === 'noop') {
        return {
          type: 'noop',
          data: {},
          userId: '',
          chatId: ''
        };
      }

      // Handle simple colon-separated format for compatibility
      if (data.includes(':') && !data.startsWith('{')) {
        const parts = data.split(':');
        return {
          type: parts[0],
          data: {
            action: parts[1],
            value: parts[2]
          },
          userId: '',
          chatId: ''
        };
      }

      // Handle JSON format
      const parsed = JSON.parse(data);
      return {
        type: parsed.t || parsed.type,
        data: parsed.d || parsed.data || {},
        userId: '',
        chatId: ''
      };
    } catch (error) {
      console.error('[callback-handler] Error decoding callback data:', error);
      return null;
    }
  }

  registerCallbackHandler(pattern: string, handler: CallbackHandlerFunction): void {
    this.handlers.set(pattern, handler);
    console.log(`[callback-handler] Registered handler for pattern: ${pattern}`);
  }

  async routeCallback(action: CallbackAction, context: UserContext): Promise<CallbackResult> {
    // Find matching handler
    const handler = this.findHandler(action.type);
    if (!handler) {
      console.warn(`[callback-handler] No handler found for action type: ${action.type}`);
      return {
        notification: 'Action not supported',
        updateMessage: false
      };
    }

    try {
      return await handler(action, context);
    } catch (error) {
      console.error(`[callback-handler] Handler error for ${action.type}:`, error);
      return {
        notification: 'An error occurred processing your request',
        updateMessage: false
      };
    }
  }

  private findHandler(actionType: string): CallbackHandlerFunction | null {
    // Direct match
    if (this.handlers.has(actionType)) {
      return this.handlers.get(actionType)!;
    }

    // Pattern matching
    for (const [pattern, handler] of this.handlers.entries()) {
      if (this.matchesPattern(actionType, pattern)) {
        return handler;
      }
    }

    return null;
  }

  private matchesPattern(actionType: string, pattern: string): boolean {
    // Simple wildcard matching
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(actionType);
    }

    // Prefix matching
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -2);
      return actionType.startsWith(prefix);
    }

    return actionType === pattern;
  }

  private registerDefaultHandlers(): void {
    // No-op handler
    this.registerCallbackHandler('noop', async () => ({
      updateMessage: false
    }));

    // Project selection handlers
    this.registerCallbackHandler('select:project', async (action, context) => {
      const projectId = action.data.value || action.data.projectId;
      if (!projectId) {
        return {
          notification: 'Invalid project selection',
          updateMessage: false
        };
      }

      // TODO: Integrate with project service to select project
      console.log(`[callback-handler] Selecting project: ${projectId}`);
      
      return {
        notification: `Selected project: ${projectId}`,
        updateMessage: true,
        response: {
          text: `🎯 **Project Selected**\n\nProject ${projectId} is now active. You can now use project-specific commands like \`/tasks\`, \`/boards\`, and \`/analytics\`.`,
          parseMode: 'Markdown'
        }
      };
    });

    // Project list handlers
    this.registerCallbackHandler('projects:*', async (action, context) => {
      const subAction = action.data.action;
      
      switch (subAction) {
        case 'refresh':
          // TODO: Refresh project list
          return {
            notification: 'Projects refreshed',
            updateMessage: true,
            response: {
              text: '🔄 **Refreshing Projects...**\n\nPlease wait while we update the project list.',
              parseMode: 'Markdown'
            }
          };
          
        case 'page':
          const page = parseInt(action.data.value || '1');
          // TODO: Load specific page
          return {
            notification: `Loading page ${page}`,
            updateMessage: true
          };
          
        default:
          return {
            notification: 'Unknown projects action',
            updateMessage: false
          };
      }
    });

    // Context management handlers
    this.registerCallbackHandler('context:*', async (action, context) => {
      const subAction = action.data.action;
      
      switch (subAction) {
        case 'clear':
          // TODO: Clear project context
          return {
            notification: 'Project context cleared',
            updateMessage: true,
            response: this.uiGenerator.generateContextStatus(null)
          };
          
        case 'manage':
          if (!context.activeProject) {
            return {
              notification: 'No active project to manage',
              updateMessage: false
            };
          }
          
          return {
            updateMessage: true,
            response: this.uiGenerator.generateContextActions(context.activeProject)
          };
          
        case 'status':
          return {
            updateMessage: true,
            response: this.uiGenerator.generateContextStatus(context.activeProject || null)
          };
          
        default:
          return {
            notification: 'Unknown context action',
            updateMessage: false
          };
      }
    });

    // Help system handlers
    this.registerCallbackHandler('help:*', async (action, context) => {
      const subAction = action.data.action;
      
      switch (subAction) {
        case 'main':
          return {
            updateMessage: true,
            response: this.uiGenerator.generateHelpMenu([
              'project-management',
              'task-management', 
              'context-management',
              'analytics',
              'help'
            ] as any)
          };
          
        case 'category':
          const category = action.data.value;
          if (!category) {
            return {
              notification: 'Invalid help category',
              updateMessage: false
            };
          }
          
          // TODO: Get commands for category
          return {
            updateMessage: true,
            response: this.uiGenerator.generateCategoryHelp(category as any, [])
          };
          
        default:
          return {
            notification: 'Unknown help action',
            updateMessage: false
          };
      }
    });

    // Task management handlers
    this.registerCallbackHandler('task:*', async (action, context) => {
      const subAction = action.data.action;
      
      switch (subAction) {
        case 'details':
          const taskId = action.data.value;
          if (!taskId) {
            return {
              notification: 'Invalid task ID',
              updateMessage: false
            };
          }
          
          // TODO: Load task details
          return {
            notification: `Loading task ${taskId}`,
            updateMessage: true
          };
          
        case 'edit':
          return {
            notification: 'Task editing not yet implemented',
            updateMessage: false
          };
          
        case 'move':
          return {
            notification: 'Task moving not yet implemented',
            updateMessage: false
          };
          
        case 'delete':
          return {
            notification: 'Task deletion not yet implemented',
            updateMessage: false
          };
          
        default:
          return {
            notification: 'Unknown task action',
            updateMessage: false
          };
      }
    });

    // Board management handlers
    this.registerCallbackHandler('boards:*', async (action, context) => {
      const subAction = action.data.action;
      
      switch (subAction) {
        case 'list':
          const projectId = action.data.value;
          // TODO: Load boards for project
          return {
            notification: 'Loading boards...',
            updateMessage: true
          };
          
        default:
          return {
            notification: 'Unknown boards action',
            updateMessage: false
          };
      }
    });

    // Creation handlers
    this.registerCallbackHandler('create:*', async (action, context) => {
      const itemType = action.type.split(':')[1];
      
      switch (itemType) {
        case 'project':
          return {
            notification: 'Project creation not yet implemented',
            updateMessage: false
          };
          
        case 'task':
          if (!context.activeProject) {
            return {
              notification: 'Please select a project first',
              updateMessage: false
            };
          }
          
          return {
            notification: 'Task creation not yet implemented',
            updateMessage: false
          };
          
        default:
          return {
            notification: `Creation of ${itemType} not supported`,
            updateMessage: false
          };
      }
    });

    // Analytics handlers
    this.registerCallbackHandler('analytics:*', async (action, context) => {
      const subAction = action.data.action;
      
      switch (subAction) {
        case 'current':
        case 'project':
          if (!context.activeProject) {
            return {
              notification: 'Please select a project first',
              updateMessage: false
            };
          }
          
          return {
            notification: 'Analytics not yet implemented',
            updateMessage: false
          };
          
        default:
          return {
            notification: 'Unknown analytics action',
            updateMessage: false
          };
      }
    });

    console.log('[callback-handler] Registered default callback handlers');
  }
}