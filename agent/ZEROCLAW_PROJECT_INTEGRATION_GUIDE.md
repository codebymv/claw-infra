# ZeroClaw Project Management Integration Guide

## 🎯 Problem Solved

The `/projects` command was being interpreted by ZeroClaw as a file system command instead of our custom project management command. This guide explains the solution and how to use the integrated project management system.

## 🔧 Solution: CLI Integration

Instead of trying to override ZeroClaw's built-in commands, we created a **CLI tool** that ZeroClaw can call to access project management features.

### Architecture
```
Telegram User → ZeroClaw Agent → project-manager.js CLI → Project Management System → Backend API
```

## 📱 How It Works for Users

### **User Types in Telegram:**
```
User: "/projects"
```

### **ZeroClaw Processes This As:**
```
ZeroClaw: I'll show you the projects using the project management system.
ZeroClaw: [Executes] node /app/project-manager.js projects
ZeroClaw: [Returns formatted project list to user]
```

### **User Sees:**
```
📋 Your Projects (active • page 1)

🎯 1. Website Redesign 🟢
   📝 Complete redesign of company website
   📊 3 boards • 12 cards
   ⏰ 2h ago
   👆 Select: /select proj_123

📋 2. Mobile App 🟢  
   📝 iOS and Android mobile application
   📊 2 boards • 8 cards
   ⏰ 1d ago
   👆 Select: /select proj_456
```

## 🛠️ CLI Commands Available

### **Project Browser Commands**
```bash
node /app/project-manager.js projects              # Browse all projects
node /app/project-manager.js projects 2            # Page 2
node /app/project-manager.js select proj_123       # Select project
node /app/project-manager.js context               # Show current selection
node /app/project-manager.js clear                 # Clear selection
```

### **Contextual Commands** (require selected project)
```bash
node /app/project-manager.js create-task "Task Title"
node /app/project-manager.js list-tasks
node /app/project-manager.js search "query"
node /app/project-manager.js boards
node /app/project-manager.js analytics
```

### **Traditional Commands**
```bash
node /app/project-manager.js create-project "Project Name"
node /app/project-manager.js list-projects
```

### **Natural Language Processing**
```bash
node /app/project-manager.js nlp "show me all my projects"
node /app/project-manager.js nlp "create a task called homepage design"
node /app/project-manager.js nlp "list tasks with high priority"
```

## 🤖 ZeroClaw System Prompt Integration

The system prompt has been updated to instruct ZeroClaw on how to handle project management requests:

```
## Project Management System
You have access to a project management system via the project-manager CLI tool.
When users ask about projects, tasks, or project management, use these commands:

**When users say things like:**
- "/projects" or "show my projects" → use `node /app/project-manager.js projects`
- "select project X" → use `node /app/project-manager.js select X`
- "create task Y" → use `node /app/project-manager.js create-task "Y"`
- "list tasks" → use `node /app/project-manager.js list-tasks`
- Any other project request → use `node /app/project-manager.js nlp "user request"`
```

## 📋 User Command Mapping

### **What User Types → What ZeroClaw Executes**

| User Input | ZeroClaw Command | Result |
|------------|------------------|---------|
| `/projects` | `node /app/project-manager.js projects` | Interactive project browser |
| `/select proj_123` | `node /app/project-manager.js select proj_123` | Select project as context |
| `create task "Homepage"` | `node /app/project-manager.js create-task "Homepage"` | Create task in active project |
| `list tasks` | `node /app/project-manager.js list-tasks` | Show tasks in active project |
| `search "login"` | `node /app/project-manager.js search "login"` | Search tasks in active project |
| `show boards` | `node /app/project-manager.js boards` | Display project boards |
| `analytics` | `node /app/project-manager.js analytics` | Show project analytics |
| `create project "New"` | `node /app/project-manager.js create-project "New"` | Create new project |

## 🔄 Complete User Workflow

### **1. Browse Projects**
```
User: "/projects"
ZeroClaw: [Executes CLI] → Shows interactive project browser
User: Sees all projects with selection options
```

### **2. Select Project**
```
User: "/select proj_123"
ZeroClaw: [Executes CLI] → Sets project as active context
User: Sees confirmation and available contextual commands
```

### **3. Work with Tasks**
```
User: "create task 'Design homepage'"
ZeroClaw: [Executes CLI] → Creates task in active project
User: Sees task creation confirmation

User: "list tasks"
ZeroClaw: [Executes CLI] → Shows all tasks in active project
User: Sees formatted task list with priorities and status
```

### **4. Search and Analytics**
```
User: "search 'authentication'"
ZeroClaw: [Executes CLI] → Searches within active project
User: Sees matching tasks

User: "analytics"
ZeroClaw: [Executes CLI] → Shows project metrics
User: Sees velocity, team performance, project health
```

## 🎯 Key Benefits

### **For Users**
- **Natural Commands**: Type `/projects` just like any other command
- **Contextual Workflow**: Select project once, then use simplified commands
- **Visual Browsing**: See all projects with status and activity
- **Intelligent Processing**: Natural language understanding

### **For ZeroClaw**
- **No Conflicts**: Doesn't interfere with built-in file system commands
- **Flexible Integration**: Can call any CLI command as needed
- **Error Handling**: Graceful fallbacks and helpful error messages
- **Extensible**: Easy to add new project management features

### **For Development**
- **Clean Separation**: Project management logic isolated in CLI
- **Easy Testing**: CLI can be tested independently
- **Docker Ready**: Included in container build process
- **Maintainable**: Clear interface between ZeroClaw and project system

## 🚀 Deployment

### **Files Added/Modified**
```
claw-infra/agent/
├── project-manager.js                    # CLI tool for ZeroClaw
├── src/config-gen.ts                     # Updated system prompt
├── Dockerfile                            # Added CLI to container
├── test-project-cli.js                   # CLI testing script
└── ZEROCLAW_PROJECT_INTEGRATION_GUIDE.md # This guide
```

### **Environment Variables**
```bash
# User identification (set by ZeroClaw)
ZEROCLAW_USER_ID=user-123
ZEROCLAW_CHAT_ID=chat-456

# Backend connection
BACKEND_INTERNAL_URL=http://localhost:3000
CLAW_API_KEY=your-api-key

# ZeroClaw configuration
ZEROCLAW_TELEGRAM_BOT_TOKEN=your-telegram-token
ZEROCLAW_API_KEY=your-openrouter-key
```

## 🧪 Testing

### **Test CLI Locally**
```bash
cd claw-infra/agent
npm run build
node test-project-cli.js
```

### **Test Individual Commands**
```bash
node project-manager.js help
node project-manager.js context
node project-manager.js nlp "show me help"
```

### **Test with ZeroClaw**
1. Start backend: `npm run start:dev` (in backend directory)
2. Start agent: `npm run start` (in agent directory)
3. Use Telegram bot:
   - `/projects` - Should show project browser
   - `/select proj_123` - Should select project
   - `create task "Test"` - Should create task

## 🔍 Troubleshooting

### **Issue: `/projects` still shows file system**
**Solution**: Restart ZeroClaw agent to load updated system prompt

### **Issue: CLI commands fail**
**Check**: 
- Backend is running and accessible
- Environment variables are set correctly
- CLI script has execute permissions

### **Issue: Context not persisting**
**Check**:
- User ID and Chat ID are consistent across commands
- Session hasn't expired (24-hour timeout)

### **Issue: Natural language not working**
**Try**: Use explicit CLI commands first, then test NLP

## 🎉 Success Indicators

### **✅ Working Correctly When:**
- `/projects` shows formatted project browser (not file system)
- `/select proj_123` confirms project selection
- `create task "Test"` works without specifying project name
- `list tasks` shows tasks from active project only
- Natural language commands are processed correctly

### **📊 Expected User Experience:**
1. **Seamless Integration**: Commands work as if built into ZeroClaw
2. **Contextual Awareness**: System remembers selected project
3. **Rich Formatting**: Responses include emojis, structure, and helpful info
4. **Error Guidance**: Clear messages when something goes wrong
5. **Natural Flow**: Users can have conversations about their projects

## 🌟 Result

The project management system is now **fully integrated with ZeroClaw** through a clean CLI interface. Users can:

- Browse projects visually with `/projects`
- Select projects for contextual commands
- Create and manage tasks with simplified syntax
- Search and analyze projects naturally
- Use both explicit commands and natural language

The integration is **production-ready** and provides a seamless project management experience through conversational AI.