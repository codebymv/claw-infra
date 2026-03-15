#!/usr/bin/env node

// Project Manager CLI for ZeroClaw integration
// This script provides command-line access to project management features

const { getProjectClient } = require('./dist/project-client');
const { projectBrowser } = require('./dist/project-browser');
const { contextualCommands } = require('./dist/contextual-commands');
const projectContextManager = require('./dist/project-context-manager').default;
const { 
  createProject, 
  listProjects, 
  processNaturalLanguageCommand 
} = require('./dist/project-zeroclaw-tools');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

// Default user info (ZeroClaw should set these as env vars)
const userId = process.env.ZEROCLAW_USER_ID || process.env.TELEGRAM_USER_ID || 'zeroclaw-user';
const chatId = process.env.ZEROCLAW_CHAT_ID || process.env.TELEGRAM_CHAT_ID || 'zeroclaw-chat';

async function main() {
  try {
    let result = '';

    switch (command) {
      case 'projects':
      case 'browse':
        const page = parseInt(args[1]) || 1;
        const filter = args[2] || 'active';
        result = await projectBrowser.handleProjectsCommand({
          userId,
          chatId,
          page,
          filter
        });
        break;

      case 'select':
        if (!args[1]) {
          result = '❌ Usage: project-manager select <project-id>';
          break;
        }
        result = await projectBrowser.selectProject(args[1], userId, chatId);
        break;

      case 'context':
      case 'status':
        result = projectBrowser.getContextStatus(userId, chatId);
        break;

      case 'clear':
        result = projectBrowser.clearContext(userId, chatId);
        break;

      case 'create-task':
        if (!args[1]) {
          result = '❌ Usage: project-manager create-task "Task Title" [priority] [type]';
          break;
        }
        result = await contextualCommands.createTask(userId, chatId, {
          title: args[1],
          priority: args[2],
          type: args[3]
        });
        break;

      case 'list-tasks':
        result = await contextualCommands.listTasks(userId, chatId, {
          priority: args[1],
          limit: args[2] ? parseInt(args[2]) : undefined
        });
        break;

      case 'search':
        if (!args[1]) {
          result = '❌ Usage: project-manager search "query"';
          break;
        }
        result = await contextualCommands.searchTasks(userId, chatId, args[1]);
        break;

      case 'boards':
        result = await contextualCommands.showBoards(userId, chatId);
        break;

      case 'analytics':
        const timeRange = args[1] || '30d';
        result = await contextualCommands.getAnalytics(userId, chatId, timeRange);
        break;

      case 'create-project':
        if (!args[1]) {
          result = '❌ Usage: project-manager create-project "Project Name" [description] [template]';
          break;
        }
        result = await createProject({
          name: args[1],
          description: args[2],
          template: args[3]
        });
        break;

      case 'list-projects':
        result = await listProjects({
          limit: args[1] ? parseInt(args[1]) : undefined,
          status: args[2]
        });
        break;

      case 'nlp':
      case 'process':
        if (!args[1]) {
          result = '❌ Usage: project-manager nlp "natural language command"';
          break;
        }
        result = await processNaturalLanguageCommand(args.slice(1).join(' '), userId, chatId);
        break;

      case 'help':
      default:
        result = `📋 **Project Manager CLI**

**Project Browser:**
• projects [page] [filter] - Browse projects
• select <project-id> - Select project
• context - Show current selection  
• clear - Clear selection

**Contextual Commands** (require selected project):
• create-task "Title" [priority] [type] - Create task
• list-tasks [priority] [limit] - List tasks
• search "query" - Search tasks
• boards - Show boards
• analytics [timeRange] - Show analytics

**Traditional Commands:**
• create-project "Name" [desc] [template] - Create project
• list-projects [limit] [status] - List projects

**Natural Language:**
• nlp "create a task called homepage design" - Process natural language

**Examples:**
• project-manager projects
• project-manager select proj_123
• project-manager create-task "Design homepage" high feature
• project-manager nlp "show me all my projects"

**Environment Variables:**
• ZEROCLAW_USER_ID - User identifier
• ZEROCLAW_CHAT_ID - Chat identifier
• BACKEND_INTERNAL_URL - Backend URL
• CLAW_API_KEY - API key`;
        break;
    }

    console.log(result);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);