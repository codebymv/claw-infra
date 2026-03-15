import express from 'express';
import { projectBrowser } from './project-browser';
import { contextualCommands } from './contextual-commands';
import projectContextManager from './project-context-manager';
import { 
  createProject, 
  listProjects, 
  getProject,
  processNaturalLanguageCommand 
} from './project-zeroclaw-tools';

// Simple HTTP server for ZeroClaw to interact with project management system
// This allows ZeroClaw to call our project management functions via HTTP

const app = express();
app.use(express.json());

// Extract user info from request (ZeroClaw should provide this)
function getUserInfo(req: any) {
  return {
    userId: req.headers['x-user-id'] || req.body.userId || 'default-user',
    chatId: req.headers['x-chat-id'] || req.body.chatId || 'default-chat'
  };
}

// Project browser endpoints
app.get('/projects', async (req, res) => {
  try {
    const { userId, chatId } = getUserInfo(req);
    const page = parseInt(req.query.page as string) || 1;
    const filter = req.query.filter as string || 'active';
    
    const result = await projectBrowser.handleProjectsCommand({
      userId,
      chatId,
      page,
      filter: filter as any
    });
    
    res.json({ success: true, message: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/projects/select', async (req, res) => {
  try {
    const { userId, chatId } = getUserInfo(req);
    const { projectId } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' });
    }
    
    const result = await projectBrowser.selectProject(projectId, userId, chatId);
    res.json({ success: true, message: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/projects/context', async (req, res) => {
  try {
    const { userId, chatId } = getUserInfo(req);
    const result = projectBrowser.getContextStatus(userId, chatId);
    res.json({ success: true, message: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/projects/context', async (req, res) => {
  try {
    const { userId, chatId } = getUserInfo(req);
    const result = projectBrowser.clearContext(userId, chatId);
    res.json({ success: true, message: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Contextual commands
app.post('/projects/tasks', async (req, res) => {
  try {
    const { userId, chatId } = getUserInfo(req);
    const { title, description, type, priority, boardName, columnName } = req.body;
    
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    
    const result = await contextualCommands.createTask(userId, chatId, {
      title,
      description,
      type,
      priority,
      boardName,
      columnName
    });
    
    res.json({ success: true, message: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/projects/tasks', async (req, res) => {
  try {
    const { userId, chatId } = getUserInfo(req);
    const { boardName, status, priority, limit } = req.query;
    
    const result = await contextualCommands.listTasks(userId, chatId, {
      boardName: boardName as string,
      status: status as string,
      priority: priority as string,
      limit: limit ? parseInt(limit as string) : undefined
    });
    
    res.json({ success: true, message: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/projects/search', async (req, res) => {
  try {
    const { userId, chatId } = getUserInfo(req);
    const { q, boardName, priority, limit } = req.query;
    
    if (!q) {
      return res.status(400).json({ success: false, error: 'q (query) is required' });
    }
    
    const result = await contextualCommands.searchTasks(userId, chatId, q as string, {
      boardName: boardName as string,
      priority: priority as string,
      limit: limit ? parseInt(limit as string) : undefined
    });
    
    res.json({ success: true, message: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/projects/boards', async (req, res) => {
  try {
    const { userId, chatId } = getUserInfo(req);
    const result = await contextualCommands.showBoards(userId, chatId);
    res.json({ success: true, message: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/projects/analytics', async (req, res) => {
  try {
    const { userId, chatId } = getUserInfo(req);
    const timeRange = req.query.timeRange as '7d' | '30d' | '90d' || '30d';
    
    const result = await contextualCommands.getAnalytics(userId, chatId, timeRange);
    res.json({ success: true, message: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Traditional project management endpoints
app.post('/projects/create', async (req, res) => {
  try {
    const { name, description, template } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    
    const result = await createProject({ name, description, template });
    res.json({ success: true, message: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/projects/list', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const status = req.query.status as 'active' | 'archived';
    
    const result = await listProjects({ limit, status });
    res.json({ success: true, message: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Natural language processing endpoint
app.post('/projects/nlp', async (req, res) => {
  try {
    const { command } = req.body;
    const { userId, chatId } = getUserInfo(req);
    
    if (!command) {
      return res.status(400).json({ success: false, error: 'command is required' });
    }
    
    const result = await processNaturalLanguageCommand(command, userId, chatId);
    res.json({ success: true, message: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Project management server is running' });
});

// Start server
const PORT = process.env.PROJECT_MANAGEMENT_PORT || 3003;

export function startProjectManagementServer(): Promise<void> {
  return new Promise((resolve) => {
    app.listen(PORT, () => {
      console.log(`[project-server] Project management server running on port ${PORT}`);
      resolve();
    });
  });
}

export { app };