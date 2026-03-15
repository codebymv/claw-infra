import { getProjectClient } from './project-client';
import projectContextManager from './project-context-manager';

// Contextual command handlers that work with the active project context
// These provide simplified commands when a project is selected

export class ContextualCommands {
  private client = getProjectClient();

  // Create task in active project context
  async createTask(userId: string, chatId: string, args: {
    title: string;
    description?: string;
    type?: 'task' | 'feature' | 'bug' | 'epic' | 'story';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    boardName?: string;
    columnName?: string;
  }): Promise<string> {
    const context = projectContextManager.getActiveProject(userId, chatId);
    if (!context) {
      return `❌ No active project selected. Use \`/projects\` to select a project first.`;
    }

    try {
      // Get project details to find boards and columns
      const project = await this.client.getProject(context.projectId);
      
      // Find target board (default to first board if not specified)
      let targetBoard = project.boards?.[0];
      if (args.boardName) {
        targetBoard = project.boards?.find((b: any) => 
          b.name.toLowerCase().includes(args.boardName!.toLowerCase())
        );
        if (!targetBoard) {
          return `❌ Board "${args.boardName}" not found in project **${context.projectName}**.
Available boards: ${project.boards?.map((b: any) => b.name).join(', ') || 'None'}`;
        }
      }

      if (!targetBoard) {
        return `❌ No boards found in project **${context.projectName}**. Create a board first with:
\`create board "Sprint 1"\``;
      }

      // Find target column (default to first column, usually "To Do")
      let targetColumn = targetBoard.columns?.[0];
      if (args.columnName) {
        targetColumn = targetBoard.columns?.find((c: any) => 
          c.name.toLowerCase().includes(args.columnName!.toLowerCase())
        );
        if (!targetColumn) {
          return `❌ Column "${args.columnName}" not found in board **${targetBoard.name}**.
Available columns: ${targetBoard.columns?.map((c: any) => c.name).join(', ') || 'None'}`;
        }
      }

      if (!targetColumn) {
        return `❌ No columns found in board **${targetBoard.name}**.`;
      }

      // Create the task
      const card = await this.client.createCard(
        context.projectId,
        targetBoard.id,
        targetColumn.id,
        {
          title: args.title,
          description: args.description,
          type: args.type || 'task',
          priority: args.priority || 'medium'
        }
      );

      const priorityEmoji = {
        low: '🟢',
        medium: '🟡',
        high: '🟠',
        urgent: '🔴'
      }[args.priority || 'medium'];

      const typeEmoji = {
        task: '✅',
        feature: '🚀',
        bug: '🐛',
        epic: '🎯',
        story: '📖'
      }[args.type || 'task'];

      return `✅ **Task Created in ${context.projectName}**

${typeEmoji} **${card.title}**
${priorityEmoji} ${args.priority || 'medium'} priority
📋 Board: ${targetBoard.name} → ${targetColumn.name}
🆔 Card ID: ${card.id}
${args.description ? `📝 ${args.description}` : ''}

**Quick Actions:**
• \`move task "${card.title}" to "In Progress"\`
• \`add comment "Working on this" to task "${card.title}"\`
• \`update task "${card.title}" priority high\`

🔗 View in web: /projects/${context.projectId}`;

    } catch (error: any) {
      return `❌ Failed to create task in **${context.projectName}**: ${error.message}`;
    }
  }

  // List tasks in active project
  async listTasks(userId: string, chatId: string, args: {
    boardName?: string;
    status?: string;
    priority?: string;
    limit?: number;
  } = {}): Promise<string> {
    const context = projectContextManager.getActiveProject(userId, chatId);
    if (!context) {
      return `❌ No active project selected. Use \`/projects\` to select a project first.`;
    }

    try {
      const project = await this.client.getProject(context.projectId);
      
      if (!project.boards || project.boards.length === 0) {
        return `📋 **${context.projectName}** has no boards yet.
Create one with: \`create board "Sprint 1"\``;
      }

      let allCards: any[] = [];
      
      // Get cards from all boards or specific board
      for (const board of project.boards) {
        if (args.boardName && !board.name.toLowerCase().includes(args.boardName.toLowerCase())) {
          continue;
        }
        
        const cards = await this.client.listCards(context.projectId, board.id, {
          status: args.status,
          priority: args.priority,
          limit: args.limit || 20
        });
        
        allCards.push(...cards.map((c: any) => ({ ...c, boardName: board.name })));
      }

      if (allCards.length === 0) {
        return `📋 **No tasks found in ${context.projectName}**
${args.boardName ? `Board: ${args.boardName}` : 'All boards'}
${args.status ? `Status: ${args.status}` : ''}
${args.priority ? `Priority: ${args.priority}` : ''}

Create your first task with: \`create task "My first task"\``;
      }

      // Sort by priority and creation date
      allCards.sort((a, b) => {
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        const aPriority = (priorityOrder as any)[a.priority] || 2;
        const bPriority = (priorityOrder as any)[b.priority] || 2;
        
        if (aPriority !== bPriority) return bPriority - aPriority;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      let output = `📋 **Tasks in ${context.projectName}** (${allCards.length} found)\n`;
      if (args.boardName) output += `🎯 Board: ${args.boardName}\n`;
      if (args.status) output += `📊 Status: ${args.status}\n`;
      if (args.priority) output += `⚡ Priority: ${args.priority}\n`;
      output += `\n`;

      allCards.slice(0, args.limit || 10).forEach((card, index) => {
        const priorityEmoji = ({
          low: '🟢',
          medium: '🟡',
          high: '🟠',
          urgent: '🔴'
        } as any)[card.priority] || '🟡';

        const typeEmoji = ({
          task: '✅',
          feature: '🚀',
          bug: '🐛',
          epic: '🎯',
          story: '📖'
        } as any)[card.type] || '✅';

        output += `${typeEmoji} **${card.title}**\n`;
        output += `   ${priorityEmoji} ${card.priority} • 📋 ${card.boardName} → ${card.column?.name || 'Unknown'}\n`;
        if (card.description) {
          output += `   📝 ${card.description.substring(0, 80)}${card.description.length > 80 ? '...' : ''}\n`;
        }
        output += `   🆔 ${card.id}\n\n`;
      });

      if (allCards.length > (args.limit || 10)) {
        output += `... and ${allCards.length - (args.limit || 10)} more tasks\n\n`;
      }

      output += `**Quick Actions:**\n`;
      output += `• \`move task "Task Name" to "In Progress"\`\n`;
      output += `• \`update task "Task Name" priority high\`\n`;
      output += `• \`add comment "message" to task "Task Name"\`\n`;
      output += `• \`search "keyword"\` - Search tasks\n`;

      return output;

    } catch (error: any) {
      return `❌ Failed to list tasks in **${context.projectName}**: ${error.message}`;
    }
  }

  // Search tasks in active project
  async searchTasks(userId: string, chatId: string, query: string, options: {
    boardName?: string;
    priority?: string;
    limit?: number;
  } = {}): Promise<string> {
    const context = projectContextManager.getActiveProject(userId, chatId);
    if (!context) {
      return `❌ No active project selected. Use \`/projects\` to select a project first.`;
    }

    try {
      const results = await this.client.searchCards(context.projectId, {
        q: query,
        priority: options.priority,
        limit: options.limit || 10
      });

      if (results.length === 0) {
        return `🔍 **No tasks found in ${context.projectName}**
Query: "${query}"
${options.priority ? `Priority: ${options.priority}` : ''}

Try different keywords or check if tasks exist in the project.`;
      }

      let output = `🔍 **Search Results in ${context.projectName}** (${results.length} found)\n`;
      output += `Query: "${query}"\n`;
      if (options.priority) output += `Priority: ${options.priority}\n`;
      output += `\n`;

      results.forEach((card: any) => {
        const priorityEmoji = ({
          low: '🟢',
          medium: '🟡',
          high: '🟠',
          urgent: '🔴'
        } as any)[card.priority] || '🟡';

        const typeEmoji = ({
          task: '✅',
          feature: '🚀',
          bug: '🐛',
          epic: '🎯',
          story: '📖'
        } as any)[card.type] || '✅';

        output += `${typeEmoji} **${card.title}**\n`;
        output += `   ${priorityEmoji} ${card.priority} • 📋 ${card.column?.name || 'Unknown column'}\n`;
        if (card.description) {
          output += `   📝 ${card.description.substring(0, 100)}${card.description.length > 100 ? '...' : ''}\n`;
        }
        output += `   🆔 ${card.id}\n\n`;
      });

      return output;

    } catch (error: any) {
      return `❌ Failed to search tasks in **${context.projectName}**: ${error.message}`;
    }
  }

  // Show boards in active project
  async showBoards(userId: string, chatId: string): Promise<string> {
    const context = projectContextManager.getActiveProject(userId, chatId);
    if (!context) {
      return `❌ No active project selected. Use \`/projects\` to select a project first.`;
    }

    try {
      const boards = await this.client.listBoards(context.projectId);

      if (boards.length === 0) {
        return `📋 **${context.projectName}** has no boards yet.

Create your first board:
• \`create board "Sprint 1"\` - Development sprint
• \`create board "Backlog"\` - Task backlog  
• \`create board "Bug Tracking"\` - Issue tracking`;
      }

      let output = `📋 **Boards in ${context.projectName}** (${boards.length} total)\n\n`;

      boards.forEach((board: any, index: number) => {
        output += `${index + 1}. **${board.name}**\n`;
        output += `   📝 ${board.description || 'No description'}\n`;
        output += `   📊 ${board.cardCount || 0} cards\n`;
        
        if (board.columns && board.columns.length > 0) {
          output += `   📋 Columns: ${board.columns.map((c: any) => c.name).join(' → ')}\n`;
        }
        
        output += `   🆔 ${board.id}\n\n`;
      });

      output += `**Quick Actions:**\n`;
      output += `• \`create task "Task name" in board "Board Name"\`\n`;
      output += `• \`list tasks in board "Board Name"\`\n`;
      output += `• \`create board "New Board"\`\n`;

      return output;

    } catch (error: any) {
      return `❌ Failed to show boards in **${context.projectName}**: ${error.message}`;
    }
  }

  // Get analytics for active project
  async getAnalytics(userId: string, chatId: string, timeRange: '7d' | '30d' | '90d' = '30d'): Promise<string> {
    const context = projectContextManager.getActiveProject(userId, chatId);
    if (!context) {
      return `❌ No active project selected. Use \`/projects\` to select a project first.`;
    }

    try {
      const analytics = await this.client.getProjectAnalytics(context.projectId, timeRange);

      return `📊 **Analytics for ${context.projectName}** (${timeRange})

**📈 Velocity Metrics:**
• Cards completed: ${analytics.completedCards || 0}
• Average completion time: ${analytics.avgCompletionTime || 'N/A'}
• Throughput: ${analytics.throughput || 0} cards/week

**👥 Team Performance:**
• Active contributors: ${analytics.activeContributors || 0}
• Total comments: ${analytics.totalComments || 0}
• Collaboration score: ${analytics.collaborationScore || 'N/A'}

**🎯 Project Health:**
• On-time delivery: ${analytics.onTimeDelivery || 'N/A'}%
• Blocked cards: ${analytics.blockedCards || 0}
• Overdue cards: ${analytics.overdueCards || 0}

**📋 Board Distribution:**
${analytics.columnDistribution ? 
  Object.entries(analytics.columnDistribution)
    .map(([col, count]) => `• ${col}: ${count} cards`)
    .join('\n') : 
  'No distribution data available'
}

🔗 View detailed analytics: /projects/${context.projectId}`;

    } catch (error: any) {
      return `❌ Failed to get analytics for **${context.projectName}**: ${error.message}`;
    }
  }
}

export const contextualCommands = new ContextualCommands();