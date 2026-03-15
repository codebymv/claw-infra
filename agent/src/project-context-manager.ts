// Project Context Manager for Telegram Bot
// Manages active project context per user/chat to enable simplified commands

interface ProjectContext {
  projectId: string;
  projectName: string;
  projectSlug: string;
  selectedAt: Date;
  boards?: Array<{
    id: string;
    name: string;
    cardCount: number;
  }>;
  recentCards?: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
  }>;
}

interface UserSession {
  userId: string;
  chatId: string;
  activeProject?: ProjectContext;
  lastActivity: Date;
}

class ProjectContextManager {
  private sessions: Map<string, UserSession> = new Map();
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

  // Get or create user session
  private getSession(userId: string, chatId: string): UserSession {
    const sessionKey = `${userId}_${chatId}`;
    let session = this.sessions.get(sessionKey);
    
    if (!session) {
      session = {
        userId,
        chatId,
        lastActivity: new Date()
      };
      this.sessions.set(sessionKey, session);
    } else {
      session.lastActivity = new Date();
    }
    
    return session;
  }

  // Set active project context for user
  setActiveProject(userId: string, chatId: string, projectContext: ProjectContext): void {
    const session = this.getSession(userId, chatId);
    session.activeProject = {
      ...projectContext,
      selectedAt: new Date()
    };
    console.log(`[context] User ${userId} selected project: ${projectContext.projectName}`);
  }

  // Get active project context for user
  getActiveProject(userId: string, chatId: string): ProjectContext | null {
    const session = this.getSession(userId, chatId);
    
    // Check if context is still valid (not expired)
    if (session.activeProject) {
      const contextAge = Date.now() - session.activeProject.selectedAt.getTime();
      if (contextAge > this.SESSION_TIMEOUT) {
        session.activeProject = undefined;
        return null;
      }
    }
    
    return session.activeProject || null;
  }

  // Clear active project context
  clearActiveProject(userId: string, chatId: string): void {
    const session = this.getSession(userId, chatId);
    session.activeProject = undefined;
    console.log(`[context] Cleared project context for user ${userId}`);
  }

  // Update project context with fresh data
  async updateProjectContext(userId: string, chatId: string, projectData: any): Promise<void> {
    const session = this.getSession(userId, chatId);
    if (session.activeProject && session.activeProject.projectId === projectData.id) {
      session.activeProject = {
        ...session.activeProject,
        projectName: projectData.name,
        boards: projectData.boards?.map((b: any) => ({
          id: b.id,
          name: b.name,
          cardCount: b.cardCount || 0
        })),
        recentCards: projectData.recentCards?.slice(0, 5).map((c: any) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          priority: c.priority
        }))
      };
    }
  }

  // Get context summary for display
  getContextSummary(userId: string, chatId: string): string | null {
    const context = this.getActiveProject(userId, chatId);
    if (!context) return null;

    const timeAgo = Math.floor((Date.now() - context.selectedAt.getTime()) / (1000 * 60));
    const timeDisplay = timeAgo < 60 ? `${timeAgo}m ago` : `${Math.floor(timeAgo / 60)}h ago`;

    return `🎯 **Active Project**: ${context.projectName}
📋 ${context.boards?.length || 0} boards • ${context.recentCards?.length || 0} recent cards
⏰ Selected ${timeDisplay}`;
  }

  // Check if user has active context
  hasActiveContext(userId: string, chatId: string): boolean {
    return this.getActiveProject(userId, chatId) !== null;
  }

  // Cleanup expired sessions
  cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      const sessionAge = now - session.lastActivity.getTime();
      if (sessionAge > this.SESSION_TIMEOUT) {
        this.sessions.delete(key);
      }
    }
  }

  // Get all active sessions (for debugging)
  getActiveSessions(): Array<{ userId: string; chatId: string; projectName?: string; lastActivity: Date }> {
    return Array.from(this.sessions.values()).map(session => ({
      userId: session.userId,
      chatId: session.chatId,
      projectName: session.activeProject?.projectName,
      lastActivity: session.lastActivity
    }));
  }
}

// Global instance
const projectContextManager = new ProjectContextManager();

// Cleanup expired sessions every hour
setInterval(() => {
  projectContextManager.cleanupExpiredSessions();
}, 60 * 60 * 1000);

export { ProjectContextManager, ProjectContext, UserSession };
export default projectContextManager;