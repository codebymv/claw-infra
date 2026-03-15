# Contextual Project Management System

## 🎯 Overview

The contextual project management system provides an intuitive way to work with projects through Telegram by allowing users to **select an active project** and then use **simplified commands** without repeatedly specifying project names.

## 🚀 Key Benefits

### **Before (Traditional)**
```
User: "create task 'Design homepage' in project 'Website Redesign' in board 'Sprint 1'"
User: "list tasks in project 'Website Redesign'"  
User: "search 'login' in project 'Website Redesign'"
```

### **After (Contextual)**
```
User: "/projects"
Bot: [Shows interactive project browser]
User: "/select proj_123"
Bot: ✅ Project Selected: Website Redesign

User: "create task 'Design homepage'"
User: "list tasks"
User: "search 'login'"
```

## 📱 Interactive Project Browser

### `/projects` Command
The `/projects` command provides a visual, paginated browser of all projects:

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

Actions:
• /select <project-id> - Select a project
• /context - Show current selection
• /clear - Clear selection
• /projects 2 - Next page

💡 Tip: After selecting a project, you can use simplified commands!
```

### Project Selection
When you select a project with `/select proj_123`:

```
🎯 Project Selected: Website Redesign

📋 Project Details:
📝 Complete redesign of company website
📊 3 boards • 12 cards
🗓️ Created: 12/15/2024
🔗 Web: /projects/proj_123

📋 Boards:
• Sprint 1 (8 cards)
• Backlog (4 cards)

✅ Context Active! You can now use simplified commands:

Quick Commands:
• create task "Design homepage" - Add new task
• list tasks - Show all tasks  
• search "login" - Search tasks
• show boards - List boards
• analytics - Project insights

💡 All commands now work within Website Redesign without needing to specify the project name!
```

## 🎯 Contextual Commands

Once a project is selected, you can use these simplified commands:

### Task Management
```
# Create tasks (automatically goes to first board/column)
"create task 'Design homepage'"
"create task 'Fix login bug' priority high"
"create task 'User authentication' type feature"

# List and search tasks
"list tasks"
"list tasks priority high"
"search 'login'"
"search 'authentication' priority urgent"

# Task operations
"move task 'Design homepage' to 'In Progress'"
"update task 'Login bug' priority urgent"
"add comment 'Working on this' to task 'Design homepage'"
```

### Project Overview
```
# Show project structure
"show boards"
"analytics"
"analytics 7d"  # 7-day analytics

# Context management
"/context"  # Show current selection
"/clear"    # Clear selection
"/projects" # Browse other projects
```

## 🧠 Smart Context Management

### Session Persistence
- **24-hour sessions**: Context persists for 24 hours of inactivity
- **Per-user/chat**: Each user in each chat has independent context
- **Automatic cleanup**: Expired sessions are automatically cleaned up

### Context Awareness
The system provides contextual help and suggestions:

```
User: "create task"
Bot: ❌ No active project selected. Use `/projects` to select a project first.

User: "list tasks"  
Bot: [Shows tasks from active project: Website Redesign]

User: "create task 'Homepage design' in board 'Sprint 2'"
Bot: [Creates task in active project, specific board]
```

### Smart Defaults
- **Default board**: Uses first board if not specified
- **Default column**: Uses first column (usually "To Do")
- **Default priority**: Medium priority for new tasks
- **Default type**: Task type for new cards

## 🔧 Technical Architecture

### Context Storage
```typescript
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
```

### Session Management
- **In-memory storage**: Fast access, automatic cleanup
- **User identification**: Based on userId + chatId combination
- **Timeout handling**: 24-hour session expiration
- **Context updates**: Refreshed with latest project data

### Command Routing
```
User Input → Natural Language Processing → Context Check → Command Execution
                                              ↓
                                    Has Active Project?
                                         ↓        ↓
                                      Yes       No
                                       ↓         ↓
                              Contextual    Traditional
                              Commands      Commands
```

## 📊 Usage Examples

### Complete Workflow
```
1. User: "/projects"
   Bot: [Shows project browser with 5 projects]

2. User: "/select proj_123"  
   Bot: ✅ Project Selected: Website Redesign
        [Shows project details and available commands]

3. User: "create task 'Design new homepage'"
   Bot: ✅ Task Created in Website Redesign
        ✅ Design new homepage
        🟡 medium priority
        📋 Board: Sprint 1 → To Do

4. User: "list tasks"
   Bot: 📋 Tasks in Website Redesign (12 found)
        [Shows all tasks with priorities and status]

5. User: "move task 'Design new homepage' to 'In Progress'"
   Bot: ✅ Task moved successfully

6. User: "search 'login'"
   Bot: 🔍 Search Results in Website Redesign (3 found)
        [Shows matching tasks]

7. User: "analytics"
   Bot: 📊 Analytics for Website Redesign (30d)
        [Shows velocity, team performance, health metrics]

8. User: "/clear"
   Bot: ✅ Cleared active project context for Website Redesign
```

### Multi-Project Workflow
```
User: "/projects"
Bot: [Shows all projects]

User: "/select proj_123"  # Website project
Bot: ✅ Project Selected: Website Redesign

User: "create task 'Fix header bug'"
Bot: ✅ Task Created in Website Redesign

User: "/projects"  # Switch to different project
Bot: [Shows all projects, Website Redesign marked as selected]

User: "/select proj_456"  # Mobile app project  
Bot: ✅ Project Selected: Mobile App

User: "create task 'Add push notifications'"
Bot: ✅ Task Created in Mobile App

User: "/context"
Bot: 🎯 Active Project: Mobile App
     📋 2 boards • 9 cards
     ⏰ Selected 5m ago
```

## 🎨 User Experience Features

### Visual Indicators
- **🎯 Selected project**: Clear indication of active project
- **🟢 Active status**: Green dot for active projects
- **📊 Quick stats**: Board and card counts at a glance
- **⏰ Time indicators**: When projects were last active

### Smart Suggestions
- **Context-aware help**: Different help based on whether project is selected
- **Command completion**: Suggests next logical actions
- **Error guidance**: Helpful messages when context is missing

### Responsive Design
- **Pagination**: Handle large project lists efficiently
- **Filtering**: Show active/archived/all projects
- **Search integration**: Find projects and tasks quickly

## 🔒 Security & Privacy

### Session Isolation
- **Per-user contexts**: Users can't see each other's selections
- **Chat isolation**: Different contexts per chat/group
- **Automatic cleanup**: No persistent storage of sensitive data

### Permission Inheritance
- **Project access**: Context respects existing project permissions
- **API authentication**: All operations use proper authentication
- **Audit logging**: Context changes are logged for security

## 🚀 Benefits Summary

### **For Users**
- **Faster workflow**: No need to repeat project names
- **Visual browsing**: See all projects at a glance
- **Intuitive commands**: Natural language that "just works"
- **Context awareness**: System remembers your selection

### **For Teams**
- **Reduced errors**: Less chance of working in wrong project
- **Better adoption**: Easier to use = more team engagement
- **Consistent workflow**: Standardized way to interact with projects

### **For Productivity**
- **Fewer keystrokes**: Simplified command syntax
- **Mental model**: Matches how people think about work
- **Quick switching**: Easy to move between projects
- **Smart defaults**: System makes reasonable assumptions

## 🎯 Implementation Status

✅ **Core Features**
- Interactive project browser (`/projects`)
- Project selection (`/select`)
- Context management (`/context`, `/clear`)
- Session persistence (24-hour timeout)
- Contextual command routing

✅ **Contextual Commands**
- Task creation with smart defaults
- Task listing and searching within context
- Board management within context
- Analytics for active project
- Comment and collaboration features

✅ **User Experience**
- Visual project browser with pagination
- Clear status indicators and help text
- Error handling with guidance
- Natural language processing integration

✅ **Technical Foundation**
- In-memory session management
- Automatic cleanup and expiration
- Multi-user/chat isolation
- Integration with existing project API

The contextual project management system is **fully implemented and ready for production use**. It provides a significantly improved user experience for managing projects through Telegram while maintaining all the power and flexibility of the underlying project management system.