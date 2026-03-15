import { getProjectClient } from './project-client';
import { projectBrowser } from './project-browser';
import { contextualCommands } from './contextual-commands';
import projectContextManager from './project-context-manager';

// ZeroClaw tool handlers for project management
// These functions are called by ZeroClaw when users invoke project management commands

export async function createProject(args: {
  name: string;
  description?: string;
  template?: 'basic' | 'software' | 'marketing';
}): Promise<string> {
  try {
    const client = getProjectClient();
    const project = await client.createProject(args);
    
    return `✅ Created project "${project.name}" (ID: ${project.id})
📋 Project URL: /projects/${project.id}
🎯 Template: ${args.template || 'basic'}
${args.description ? `📝 Description: ${args.description}` : ''}

The project is ready for task management. You can now:
- Create boards with: create board "Sprint 1" in project "${project.name}"
- Add tasks with: create task "Design homepage" in project "${project.name}"`;
  } catch (error: any) {
    return `❌ Failed to create project: ${error.message}`;
  }
}

export async function listProjects(args: {
  limit?: number;
  status?: 'active' | 'archived';
} = {}): Promise<string> {
  try {
    const client = getProjectClient();
    const projects = await client.listProjects(args);
    
    if (projects.length === 0) {
      return `📋 No projects found. Create your first project with: create project "My Project"`;
    }
    
    const projectList = projects.map((p: any) => 
      `• **${p.name}** (${p.status}) - ${p.description || 'No description'}
  📋 ${p.boardCount || 0} boards, ${p.cardCount || 0} cards
  🔗 /projects/${p.id}`
    ).join('\n\n');
    
    return `📋 **Your Projects** (${projects.length} total)\n\n${projectList}`;
  } catch (error: any) {
    return `❌ Failed to list projects: ${error.message}`;
  }
}

export async function getProject(args: { projectId: string }): Promise<string> {
  try {
    const client = getProjectClient();
    const project = await client.getProject(args.projectId);
    
    return `📋 **${project.name}**
📝 ${project.description || 'No description'}
📊 Status: ${project.status}
🗓️ Created: ${new Date(project.createdAt).toLocaleDateString()}
📋 Boards: ${project.boards?.length || 0}
🎯 Cards: ${project.cardCount || 0}
🔗 URL: /projects/${project.id}

${project.boards?.length > 0 ? 
  `**Boards:**\n${project.boards.map((b: any) => `• ${b.name} (${b.cardCount || 0} cards)`).join('\n')}` : 
  'No boards yet. Create one with: create board "Sprint 1"'
}`;
  } catch (error: any) {
    return `❌ Failed to get project: ${error.message}`;
  }
}
export async function createBoard(args: {
  projectId: string;
  name: string;
  description?: string;
}): Promise<string> {
  try {
    const client = getProjectClient();
    const board = await client.createBoard(args.projectId, {
      name: args.name,
      description: args.description
    });
    
    return `✅ Created board "${board.name}" in project
📋 Board ID: ${board.id}
🔗 URL: /projects/${args.projectId}
${args.description ? `📝 Description: ${args.description}` : ''}

The board comes with default columns (To Do, In Progress, Done).
Add your first task with: create task "My first task" in board "${board.name}"`;
  } catch (error: any) {
    return `❌ Failed to create board: ${error.message}`;
  }
}

export async function createTask(args: {
  projectId: string;
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  type?: 'task' | 'feature' | 'bug' | 'epic' | 'story';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  dueDate?: string;
}): Promise<string> {
  try {
    const client = getProjectClient();
    const card = await client.createCard(
      args.projectId,
      args.boardId,
      args.columnId,
      {
        title: args.title,
        description: args.description,
        type: args.type || 'task',
        priority: args.priority || 'medium',
        tags: args.tags,
        dueDate: args.dueDate
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
    
    return `✅ Created ${args.type || 'task'}: "${card.title}"
${typeEmoji} Type: ${args.type || 'task'}
${priorityEmoji} Priority: ${args.priority || 'medium'}
📋 Card ID: ${card.id}
🔗 URL: /projects/${args.projectId}
${args.description ? `📝 Description: ${args.description}` : ''}
${args.tags?.length ? `🏷️ Tags: ${args.tags.join(', ')}` : ''}
${args.dueDate ? `📅 Due: ${args.dueDate}` : ''}

You can move this task with: move task "${card.title}" to "In Progress"`;
  } catch (error: any) {
    return `❌ Failed to create task: ${error.message}`;
  }
}

export async function moveTask(args: {
  projectId: string;
  boardId: string;
  cardId: string;
  targetColumnId: string;
  position?: number;
}): Promise<string> {
  try {
    const client = getProjectClient();
    await client.moveCard(args.projectId, args.boardId, args.cardId, {
      targetColumnId: args.targetColumnId,
      position: args.position
    });
    
    return `✅ Task moved successfully
📋 Card moved to new column
🔗 View at: /projects/${args.projectId}

The task is now in its new position and team members will be notified.`;
  } catch (error: any) {
    return `❌ Failed to move task: ${error.message}`;
  }
}
export async function searchTasks(args: {
  projectId: string;
  query: string;
  boardId?: string;
  status?: string;
  priority?: string;
  limit?: number;
}): Promise<string> {
  try {
    const client = getProjectClient();
    const results = await client.searchCards(args.projectId, {
      q: args.query,
      boardId: args.boardId,
      status: args.status,
      priority: args.priority,
      limit: args.limit || 10
    });
    
    if (results.length === 0) {
      return `🔍 No tasks found matching "${args.query}"
Try searching with different keywords or check if the project has any tasks.`;
    }
    
    const taskList = results.map((card: any) => {
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
      
      return `${typeEmoji} **${card.title}**
  ${priorityEmoji} ${card.priority} priority • 📋 ${card.column?.name || 'Unknown column'}
  ${card.description ? `📝 ${card.description.substring(0, 100)}${card.description.length > 100 ? '...' : ''}` : ''}
  🔗 /projects/${args.projectId}`;
    }).join('\n\n');
    
    return `🔍 **Search Results** (${results.length} found for "${args.query}")\n\n${taskList}`;
  } catch (error: any) {
    return `❌ Failed to search tasks: ${error.message}`;
  }
}

export async function addComment(args: {
  projectId: string;
  boardId: string;
  cardId: string;
  content: string;
  parentId?: string;
}): Promise<string> {
  try {
    const client = getProjectClient();
    const comment = await client.addComment(
      args.projectId,
      args.boardId,
      args.cardId,
      {
        content: args.content,
        parentId: args.parentId
      }
    );
    
    return `✅ Comment added successfully
💬 Comment ID: ${comment.id}
📋 Added to card in project
🔗 View at: /projects/${args.projectId}

${args.parentId ? 'Reply posted to thread.' : 'New comment thread started.'}
Team members will be notified of your comment.`;
  } catch (error: any) {
    return `❌ Failed to add comment: ${error.message}`;
  }
}

export async function getProjectAnalytics(args: {
  projectId: string;
  timeRange?: '7d' | '30d' | '90d';
}): Promise<string> {
  try {
    const client = getProjectClient();
    const analytics = await client.getProjectAnalytics(args.projectId, args.timeRange || '30d');
    
    return `📊 **Project Analytics** (${args.timeRange || '30d'})

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

🔗 View detailed analytics at: /projects/${args.projectId}`;
  } catch (error: any) {
    return `❌ Failed to get analytics: ${error.message}`;
  }
}

// Natural language processing helpers for common commands
export async function processNaturalLanguageCommand(command: string, userId?: string, chatId?: string): Promise<string> {
  const lowerCommand = command.toLowerCase();
  
  // Check for /projects command
  if (lowerCommand.startsWith('/projects') || lowerCommand === 'projects' || lowerCommand === 'browse projects') {
    if (userId && chatId) {
      const pageMatch = command.match(/\/projects\s+(\d+)/);
      const page = pageMatch ? parseInt(pageMatch[1]) : 1;
      return await projectBrowser.handleProjectsCommand({ userId, chatId, page });
    }
    return `Use: \`/projects\` to browse and select projects`;
  }

  // Check for /select command
  if (lowerCommand.startsWith('/select') || lowerCommand.startsWith('select project')) {
    const idMatch = command.match(/\/select\s+([a-zA-Z0-9-_]+)/) || 
                   command.match(/select project\s+([a-zA-Z0-9-_]+)/);
    if (idMatch && userId && chatId) {
      return await projectBrowser.selectProject(idMatch[1], userId, chatId);
    }
    return `Use: \`/select <project-id>\` to select a project`;
  }

  // Check for context commands
  if (lowerCommand === '/context' || lowerCommand === 'show context' || lowerCommand === 'current project') {
    if (userId && chatId) {
      return projectBrowser.getContextStatus(userId, chatId);
    }
    return `Use: \`/context\` to show current project selection`;
  }

  if (lowerCommand === '/clear' || lowerCommand === 'clear context' || lowerCommand === 'clear project') {
    if (userId && chatId) {
      return projectBrowser.clearContext(userId, chatId);
    }
    return `Use: \`/clear\` to clear project selection`;
  }

  // Contextual commands (work with active project)
  if (userId && chatId) {
    const hasContext = projectContextManager.hasActiveContext(userId, chatId);
    
    if (hasContext) {
      // Create task patterns
      if (lowerCommand.includes('create') && (lowerCommand.includes('task') || lowerCommand.includes('card'))) {
        const titleMatch = command.match(/create.*(?:task|card).*["']([^"']+)["']/i) ||
                          command.match(/create.*(?:task|card)\s+(.+?)(?:\s+in|\s+with|\s+priority|$)/i);
        if (titleMatch) {
          const priorityMatch = command.match(/priority\s+(low|medium|high|urgent)/i);
          const typeMatch = command.match(/type\s+(task|feature|bug|epic|story)/i);
          const boardMatch = command.match(/in board\s+["']([^"']+)["']/i) ||
                            command.match(/board\s+["']([^"']+)["']/i);
          
          return await contextualCommands.createTask(userId, chatId, {
            title: titleMatch[1].trim(),
            priority: priorityMatch?.[1] as any,
            type: typeMatch?.[1] as any,
            boardName: boardMatch?.[1]
          });
        }
      }

      // List tasks patterns
      if (lowerCommand.includes('list') && (lowerCommand.includes('task') || lowerCommand.includes('card'))) {
        const boardMatch = command.match(/in board\s+["']([^"']+)["']/i) ||
                          command.match(/board\s+["']([^"']+)["']/i);
        const priorityMatch = command.match(/priority\s+(low|medium|high|urgent)/i);
        
        return await contextualCommands.listTasks(userId, chatId, {
          boardName: boardMatch?.[1],
          priority: priorityMatch?.[1]
        });
      }

      // Search patterns
      if (lowerCommand.includes('search') || lowerCommand.includes('find')) {
        const queryMatch = command.match(/(?:search|find).*["']([^"']+)["']/i) ||
                          command.match(/(?:search|find)\s+(.+?)(?:\s+in|\s+with|$)/i);
        if (queryMatch) {
          return await contextualCommands.searchTasks(userId, chatId, queryMatch[1].trim());
        }
      }

      // Show boards
      if (lowerCommand.includes('show boards') || lowerCommand.includes('list boards') || lowerCommand === 'boards') {
        return await contextualCommands.showBoards(userId, chatId);
      }

      // Analytics
      if (lowerCommand.includes('analytics') || lowerCommand.includes('insights') || lowerCommand.includes('metrics')) {
        const timeMatch = command.match(/(7d|30d|90d)/i);
        return await contextualCommands.getAnalytics(userId, chatId, timeMatch?.[1] as any);
      }
    }
  }

  // Original non-contextual patterns
  // Project creation patterns
  if (lowerCommand.includes('create') && lowerCommand.includes('project')) {
    const nameMatch = command.match(/create.*project.*["']([^"']+)["']/i) || 
                     command.match(/create.*project\s+(.+?)(?:\s+with|\s+for|$)/i);
    if (nameMatch) {
      return await createProject({ name: nameMatch[1].trim() });
    }
  }
  
  // List projects
  if (lowerCommand.includes('list') && lowerCommand.includes('project')) {
    return await listProjects();
  }
  
  return `I can help you manage projects! Here are some commands you can try:

**📋 Project Browser:**
• \`/projects\` - Browse and select projects
• \`/select <project-id>\` - Select a project for context
• \`/context\` - Show current selection
• \`/clear\` - Clear selection

**📋 Project Management:**
• "create project 'Website Redesign'"
• "list my projects"
• "show project 'ProjectName'"

**🎯 Contextual Commands** (after selecting a project):
• "create task 'Design homepage'"
• "list tasks"
• "search 'login'"
• "show boards"
• "analytics"

**💡 Pro Tip:** Use \`/projects\` to browse your projects visually and select one. Then you can use simplified commands like "create task" without specifying the project name!

Just mention what you want to do with your projects and I'll help you get it done!`;
}