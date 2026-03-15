import { getProjectClient } from './project-client';
import projectContextManager from './project-context-manager';

// Interactive project browser for Telegram bot
// Provides /projects command with browsing and selection capabilities

export interface ProjectBrowserOptions {
  userId: string;
  chatId: string;
  page?: number;
  limit?: number;
  filter?: 'active' | 'archived' | 'all';
}

export interface ProjectListItem {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  boardCount: number;
  cardCount: number;
  lastActivity: Date;
  isSelected: boolean;
}

export class ProjectBrowser {
  private client = getProjectClient();

  // Main /projects command handler
  async handleProjectsCommand(options: ProjectBrowserOptions): Promise<string> {
    try {
      const { userId, chatId, page = 1, limit = 5, filter = 'active' } = options;
      
      // Get projects from backend
      const projects = await this.client.listProjects({
        limit: limit + 1, // Get one extra to check if there are more
        status: filter === 'all' ? undefined : filter
      });

      if (projects.length === 0) {
        return this.renderEmptyState();
      }

      // Get current active project context
      const activeProject = projectContextManager.getActiveProject(userId, chatId);
      
      // Prepare project list with selection state
      const projectList: ProjectListItem[] = projects.slice(0, limit).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description || 'No description',
        status: p.status,
        boardCount: p.boards?.length || 0,
        cardCount: p.cardCount || 0,
        lastActivity: new Date(p.updatedAt || p.createdAt),
        isSelected: activeProject?.projectId === p.id
      }));

      const hasMore = projects.length > limit;
      
      return this.renderProjectList(projectList, {
        page,
        hasMore,
        filter,
        activeProject: activeProject?.projectName
      });

    } catch (error: any) {
      return `❌ Failed to load projects: ${error.message}`;
    }
  }

  // Select a project and set it as active context
  async selectProject(projectId: string, userId: string, chatId: string): Promise<string> {
    try {
      // Get full project details
      const project = await this.client.getProject(projectId);
      
      // Set as active context
      projectContextManager.setActiveProject(userId, chatId, {
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        selectedAt: new Date(),
        boards: project.boards?.map((b: any) => ({
          id: b.id,
          name: b.name,
          cardCount: b.cardCount || 0
        })),
        recentCards: project.recentCards?.slice(0, 5).map((c: any) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          priority: c.priority
        }))
      });

      return this.renderProjectSelected(project);

    } catch (error: any) {
      return `❌ Failed to select project: ${error.message}`;
    }
  }

  // Get current project context status
  getContextStatus(userId: string, chatId: string): string {
    const summary = projectContextManager.getContextSummary(userId, chatId);
    if (!summary) {
      return `📋 No active project selected. Use \`/projects\` to browse and select a project.`;
    }
    
    const context = projectContextManager.getActiveProject(userId, chatId);
    if (!context) return summary;

    return `${summary}

**Quick Actions:**
• \`create task "Task name"\` - Add task to active project
• \`list tasks\` - Show tasks in active project  
• \`search "query"\` - Search in active project
• \`show boards\` - List project boards
• \`analytics\` - Show project analytics
• \`clear context\` - Deselect project

💡 All commands now work within **${context.projectName}** context!`;
  }

  // Clear active project context
  clearContext(userId: string, chatId: string): string {
    const activeProject = projectContextManager.getActiveProject(userId, chatId);
    if (!activeProject) {
      return `📋 No active project to clear.`;
    }

    const projectName = activeProject.projectName;
    projectContextManager.clearActiveProject(userId, chatId);
    
    return `✅ Cleared active project context for **${projectName}**.
Use \`/projects\` to select a new project.`;
  }

  // Render project list with interactive selection
  private renderProjectList(projects: ProjectListItem[], options: {
    page: number;
    hasMore: boolean;
    filter: string;
    activeProject?: string;
  }): string {
    const { page, hasMore, filter, activeProject } = options;
    
    let output = `📋 **Your Projects** (${filter} • page ${page})\n`;
    
    if (activeProject) {
      output += `🎯 **Currently Active**: ${activeProject}\n`;
    }
    
    output += `\n`;

    projects.forEach((project, index) => {
      const number = (page - 1) * 5 + index + 1;
      const selectedIcon = project.isSelected ? '🎯' : '📋';
      const statusIcon = project.status === 'active' ? '🟢' : '🟡';
      
      const lastActivity = this.formatTimeAgo(project.lastActivity);
      
      output += `${selectedIcon} **${number}. ${project.name}** ${statusIcon}\n`;
      output += `   📝 ${project.description}\n`;
      output += `   📊 ${project.boardCount} boards • ${project.cardCount} cards\n`;
      output += `   ⏰ ${lastActivity}\n`;
      
      if (project.isSelected) {
        output += `   ✅ *Currently selected*\n`;
      } else {
        output += `   👆 Select: \`/select ${project.id}\`\n`;
      }
      output += `\n`;
    });

    // Navigation and actions
    output += `**Actions:**\n`;
    output += `• \`/select <project-id>\` - Select a project\n`;
    output += `• \`/context\` - Show current selection\n`;
    output += `• \`/clear\` - Clear selection\n`;
    
    if (hasMore) {
      output += `• \`/projects ${page + 1}\` - Next page\n`;
    }
    if (page > 1) {
      output += `• \`/projects ${page - 1}\` - Previous page\n`;
    }

    output += `\n💡 **Tip**: After selecting a project, you can use simplified commands like \`create task "My task"\` without specifying the project name!`;

    return output;
  }

  // Render project selection confirmation
  private renderProjectSelected(project: any): string {
    return `🎯 **Project Selected**: ${project.name}

📋 **Project Details:**
📝 ${project.description || 'No description'}
📊 ${project.boards?.length || 0} boards • ${project.cardCount || 0} cards
🗓️ Created: ${new Date(project.createdAt).toLocaleDateString()}
🔗 Web: /projects/${project.id}

${project.boards?.length > 0 ? 
  `**📋 Boards:**\n${project.boards.map((b: any) => `• ${b.name} (${b.cardCount || 0} cards)`).join('\n')}\n` : 
  ''
}

✅ **Context Active!** You can now use simplified commands:

**Quick Commands:**
• \`create task "Design homepage"\` - Add new task
• \`list tasks\` - Show all tasks  
• \`search "login"\` - Search tasks
• \`show boards\` - List boards
• \`analytics\` - Project insights
• \`add comment "message" to task "Task Name"\` - Add comment

**Board Management:**
• \`create board "Sprint 1"\` - Add new board
• \`move task "Task Name" to "In Progress"\` - Move tasks

**Context Management:**
• \`/context\` - Show current selection
• \`/clear\` - Clear selection
• \`/projects\` - Browse other projects

💡 All commands now work within **${project.name}** without needing to specify the project name!`;
  }

  // Render empty state
  private renderEmptyState(): string {
    return `📋 **No Projects Found**

You don't have any projects yet. Let's create your first one!

**Get Started:**
• \`create project "My First Project"\` - Create a new project
• \`create project "Website Redesign" with template software\` - Create with template

**Templates Available:**
• \`basic\` - Simple kanban board
• \`software\` - Development workflow  
• \`marketing\` - Campaign management

Once you create projects, use \`/projects\` to browse and select them for easier task management!`;
  }

  // Format time ago helper
  private formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
}

// Global instance
export const projectBrowser = new ProjectBrowser();