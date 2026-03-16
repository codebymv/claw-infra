import { Injectable } from '@nestjs/common';

export interface WebResponseOptions {
  format: 'text' | 'markdown' | 'html';
  includeTimestamp?: boolean;
  includeMetadata?: boolean;
  maxLength?: number;
}

export interface FormattedWebResponse {
  content: string;
  type: 'text' | 'markdown' | 'html';
  metadata?: Record<string, any>;
}

export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  status: string;
  boardCount?: number;
  cardCount?: number;
  lastActivity?: Date;
  permissions?: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    canManage: boolean;
  };
}

export interface TaskData {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: string;
  type: string;
  boardName?: string;
  columnName?: string;
  assignee?: string;
  dueDate?: Date;
  tags?: string[];
}

@Injectable()
export class WebResponseFormatterService {
  
  /**
   * Format a project list for web display
   */
  formatProjectList(
    projects: ProjectData[],
    options: WebResponseOptions = { format: 'markdown' }
  ): FormattedWebResponse {
    if (projects.length === 0) {
      return {
        content: 'No projects found.',
        type: options.format,
      };
    }

    let content = '';

    switch (options.format) {
      case 'html':
        content = this.formatProjectListHtml(projects);
        break;
      case 'markdown':
        content = this.formatProjectListMarkdown(projects);
        break;
      default:
        content = this.formatProjectListText(projects);
    }

    return {
      content: this.truncateContent(content, options.maxLength),
      type: options.format,
      metadata: {
        projectCount: projects.length,
        timestamp: options.includeTimestamp ? new Date().toISOString() : undefined,
      },
    };
  }

  /**
   * Format a task list for web display
   */
  formatTaskList(
    tasks: TaskData[],
    options: WebResponseOptions = { format: 'markdown' }
  ): FormattedWebResponse {
    if (tasks.length === 0) {
      return {
        content: 'No tasks found.',
        type: options.format,
      };
    }

    let content = '';

    switch (options.format) {
      case 'html':
        content = this.formatTaskListHtml(tasks);
        break;
      case 'markdown':
        content = this.formatTaskListMarkdown(tasks);
        break;
      default:
        content = this.formatTaskListText(tasks);
    }

    return {
      content: this.truncateContent(content, options.maxLength),
      type: options.format,
      metadata: {
        taskCount: tasks.length,
        timestamp: options.includeTimestamp ? new Date().toISOString() : undefined,
      },
    };
  }

  /**
   * Format structured data as a table
   */
  formatTable(
    headers: string[],
    rows: string[][],
    options: WebResponseOptions = { format: 'markdown' }
  ): FormattedWebResponse {
    let content = '';

    switch (options.format) {
      case 'html':
        content = this.formatTableHtml(headers, rows);
        break;
      case 'markdown':
        content = this.formatTableMarkdown(headers, rows);
        break;
      default:
        content = this.formatTableText(headers, rows);
    }

    return {
      content: this.truncateContent(content, options.maxLength),
      type: options.format,
      metadata: {
        rowCount: rows.length,
        columnCount: headers.length,
      },
    };
  }

  /**
   * Format code with syntax highlighting
   */
  formatCode(
    code: string,
    language: string = '',
    options: WebResponseOptions = { format: 'markdown' }
  ): FormattedWebResponse {
    let content = '';

    switch (options.format) {
      case 'html':
        content = `<pre><code class="language-${language}">${this.escapeHtml(code)}</code></pre>`;
        break;
      case 'markdown':
        content = `\`\`\`${language}\n${code}\n\`\`\``;
        break;
      default:
        content = code;
    }

    return {
      content: this.truncateContent(content, options.maxLength),
      type: options.format,
      metadata: {
        language,
        lineCount: code.split('\n').length,
      },
    };
  }

  /**
   * Format error messages
   */
  formatError(
    message: string,
    code?: string,
    suggestions?: string[],
    options: WebResponseOptions = { format: 'markdown' }
  ): FormattedWebResponse {
    let content = '';

    switch (options.format) {
      case 'html':
        content = this.formatErrorHtml(message, code, suggestions);
        break;
      case 'markdown':
        content = this.formatErrorMarkdown(message, code, suggestions);
        break;
      default:
        content = this.formatErrorText(message, code, suggestions);
    }

    return {
      content: this.truncateContent(content, options.maxLength),
      type: options.format,
      metadata: {
        errorCode: code,
        suggestionCount: suggestions?.length || 0,
      },
    };
  }

  /**
   * Format success messages
   */
  formatSuccess(
    message: string,
    details?: string,
    options: WebResponseOptions = { format: 'markdown' }
  ): FormattedWebResponse {
    let content = '';

    switch (options.format) {
      case 'html':
        content = `<div class="success"><strong>✅ Success</strong><br>${this.escapeHtml(message)}${details ? `<br><small>${this.escapeHtml(details)}</small>` : ''}</div>`;
        break;
      case 'markdown':
        content = `✅ **Success**\n\n${message}${details ? `\n\n_${details}_` : ''}`;
        break;
      default:
        content = `✅ Success: ${message}${details ? `\n${details}` : ''}`;
    }

    return {
      content: this.truncateContent(content, options.maxLength),
      type: options.format,
    };
  }

  // ── Private Formatting Methods ──

  private formatProjectListMarkdown(projects: ProjectData[]): string {
    let content = '# Available Projects\n\n';
    
    projects.forEach((project, index) => {
      content += `## ${index + 1}. ${project.name}\n`;
      if (project.description) {
        content += `${project.description}\n\n`;
      }
      content += `**Status:** ${project.status}\n`;
      if (project.boardCount !== undefined) {
        content += `**Boards:** ${project.boardCount}`;
      }
      if (project.cardCount !== undefined) {
        content += ` | **Cards:** ${project.cardCount}`;
      }
      if (project.lastActivity) {
        content += `\n**Last Activity:** ${this.formatRelativeTime(project.lastActivity)}`;
      }
      content += '\n\n---\n\n';
    });

    return content;
  }

  private formatProjectListHtml(projects: ProjectData[]): string {
    let content = '<div class="project-list"><h2>Available Projects</h2>';
    
    projects.forEach((project, index) => {
      content += `<div class="project-item">`;
      content += `<h3>${index + 1}. ${this.escapeHtml(project.name)}</h3>`;
      if (project.description) {
        content += `<p>${this.escapeHtml(project.description)}</p>`;
      }
      content += `<div class="project-meta">`;
      content += `<span class="status">Status: ${project.status}</span>`;
      if (project.boardCount !== undefined) {
        content += ` | <span class="boards">Boards: ${project.boardCount}</span>`;
      }
      if (project.cardCount !== undefined) {
        content += ` | <span class="cards">Cards: ${project.cardCount}</span>`;
      }
      if (project.lastActivity) {
        content += `<br><span class="last-activity">Last Activity: ${this.formatRelativeTime(project.lastActivity)}</span>`;
      }
      content += `</div></div>`;
    });

    content += '</div>';
    return content;
  }

  private formatProjectListText(projects: ProjectData[]): string {
    let content = 'Available Projects:\n\n';
    
    projects.forEach((project, index) => {
      content += `${index + 1}. ${project.name}\n`;
      if (project.description) {
        content += `   ${project.description}\n`;
      }
      content += `   Status: ${project.status}`;
      if (project.boardCount !== undefined) {
        content += ` | Boards: ${project.boardCount}`;
      }
      if (project.cardCount !== undefined) {
        content += ` | Cards: ${project.cardCount}`;
      }
      if (project.lastActivity) {
        content += `\n   Last Activity: ${this.formatRelativeTime(project.lastActivity)}`;
      }
      content += '\n\n';
    });

    return content;
  }

  private formatTaskListMarkdown(tasks: TaskData[]): string {
    let content = '# Task List\n\n';
    
    tasks.forEach((task, index) => {
      const priorityEmoji = this.getPriorityEmoji(task.priority);
      const statusEmoji = this.getStatusEmoji(task.status);
      
      content += `## ${index + 1}. ${priorityEmoji} ${task.title}\n`;
      if (task.description) {
        content += `${task.description}\n\n`;
      }
      content += `**Status:** ${statusEmoji} ${task.status} | **Priority:** ${task.priority}\n`;
      if (task.assignee) {
        content += `**Assignee:** ${task.assignee}\n`;
      }
      if (task.dueDate) {
        content += `**Due:** ${task.dueDate.toLocaleDateString()}\n`;
      }
      if (task.tags && task.tags.length > 0) {
        content += `**Tags:** ${task.tags.map(tag => `\`${tag}\``).join(', ')}\n`;
      }
      content += '\n---\n\n';
    });

    return content;
  }

  private formatTaskListHtml(tasks: TaskData[]): string {
    let content = '<div class="task-list"><h2>Task List</h2>';
    
    tasks.forEach((task, index) => {
      const priorityClass = `priority-${task.priority}`;
      const statusClass = `status-${task.status.replace(/\s+/g, '-').toLowerCase()}`;
      
      content += `<div class="task-item ${priorityClass} ${statusClass}">`;
      content += `<h3>${index + 1}. ${this.escapeHtml(task.title)}</h3>`;
      if (task.description) {
        content += `<p>${this.escapeHtml(task.description)}</p>`;
      }
      content += `<div class="task-meta">`;
      content += `<span class="status">Status: ${task.status}</span>`;
      content += ` | <span class="priority">Priority: ${task.priority}</span>`;
      if (task.assignee) {
        content += `<br><span class="assignee">Assignee: ${this.escapeHtml(task.assignee)}</span>`;
      }
      if (task.dueDate) {
        content += ` | <span class="due-date">Due: ${task.dueDate.toLocaleDateString()}</span>`;
      }
      if (task.tags && task.tags.length > 0) {
        content += `<br><div class="tags">${task.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join(' ')}</div>`;
      }
      content += `</div></div>`;
    });

    content += '</div>';
    return content;
  }

  private formatTaskListText(tasks: TaskData[]): string {
    let content = 'Task List:\n\n';
    
    tasks.forEach((task, index) => {
      content += `${index + 1}. ${task.title}\n`;
      if (task.description) {
        content += `   ${task.description}\n`;
      }
      content += `   Status: ${task.status} | Priority: ${task.priority}\n`;
      if (task.assignee) {
        content += `   Assignee: ${task.assignee}\n`;
      }
      if (task.dueDate) {
        content += `   Due: ${task.dueDate.toLocaleDateString()}\n`;
      }
      if (task.tags && task.tags.length > 0) {
        content += `   Tags: ${task.tags.join(', ')}\n`;
      }
      content += '\n';
    });

    return content;
  }

  private formatTableMarkdown(headers: string[], rows: string[][]): string {
    let content = `| ${headers.join(' | ')} |\n`;
    content += `| ${headers.map(() => '---').join(' | ')} |\n`;
    
    rows.forEach(row => {
      content += `| ${row.join(' | ')} |\n`;
    });

    return content;
  }

  private formatTableHtml(headers: string[], rows: string[][]): string {
    let content = '<table class="data-table"><thead><tr>';
    headers.forEach(header => {
      content += `<th>${this.escapeHtml(header)}</th>`;
    });
    content += '</tr></thead><tbody>';
    
    rows.forEach(row => {
      content += '<tr>';
      row.forEach(cell => {
        content += `<td>${this.escapeHtml(cell)}</td>`;
      });
      content += '</tr>';
    });
    
    content += '</tbody></table>';
    return content;
  }

  private formatTableText(headers: string[], rows: string[][]): string {
    const columnWidths = headers.map((header, index) => {
      const maxRowWidth = Math.max(...rows.map(row => (row[index] || '').length));
      return Math.max(header.length, maxRowWidth);
    });

    let content = '';
    
    // Header
    content += headers.map((header, index) => header.padEnd(columnWidths[index])).join(' | ') + '\n';
    content += columnWidths.map(width => '-'.repeat(width)).join('-|-') + '\n';
    
    // Rows
    rows.forEach(row => {
      content += row.map((cell, index) => (cell || '').padEnd(columnWidths[index])).join(' | ') + '\n';
    });

    return content;
  }

  private formatErrorMarkdown(message: string, code?: string, suggestions?: string[]): string {
    let content = `❌ **Error${code ? ` (${code})` : ''}**\n\n${message}`;
    
    if (suggestions && suggestions.length > 0) {
      content += '\n\n**Suggestions:**\n';
      suggestions.forEach(suggestion => {
        content += `- ${suggestion}\n`;
      });
    }

    return content;
  }

  private formatErrorHtml(message: string, code?: string, suggestions?: string[]): string {
    let content = `<div class="error"><strong>❌ Error${code ? ` (${code})` : ''}</strong><br>${this.escapeHtml(message)}`;
    
    if (suggestions && suggestions.length > 0) {
      content += '<br><strong>Suggestions:</strong><ul>';
      suggestions.forEach(suggestion => {
        content += `<li>${this.escapeHtml(suggestion)}</li>`;
      });
      content += '</ul>';
    }
    
    content += '</div>';
    return content;
  }

  private formatErrorText(message: string, code?: string, suggestions?: string[]): string {
    let content = `❌ Error${code ? ` (${code})` : ''}: ${message}`;
    
    if (suggestions && suggestions.length > 0) {
      content += '\n\nSuggestions:\n';
      suggestions.forEach(suggestion => {
        content += `- ${suggestion}\n`;
      });
    }

    return content;
  }

  // ── Utility Methods ──

  private getPriorityEmoji(priority: string): string {
    switch (priority.toLowerCase()) {
      case 'urgent': return '🔥';
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  }

  private getStatusEmoji(status: string): string {
    switch (status.toLowerCase()) {
      case 'todo': case 'to do': return '📋';
      case 'in progress': case 'in_progress': return '🔄';
      case 'review': case 'in review': return '👀';
      case 'done': case 'completed': return '✅';
      case 'blocked': return '🚫';
      default: return '⚪';
    }
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return 'Less than an hour ago';
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private truncateContent(content: string, maxLength?: number): string {
    if (!maxLength || content.length <= maxLength) {
      return content;
    }
    
    return content.substring(0, maxLength - 3) + '...';
  }
}