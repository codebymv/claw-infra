'use client';

import { useMemo } from 'react';
import { Bot, User, Terminal, AlertCircle, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils';
import { ChatMessageData } from './web-chat';

interface ChatMessageProps {
  message: ChatMessageData;
  showTimestamp?: boolean;
  enableMarkdown?: boolean;
}

export function ChatMessage({ message, showTimestamp = true, enableMarkdown = true }: ChatMessageProps) {
  const isUser = message.userId && message.userId !== 'system';
  const isCommand = message.type === 'command';
  const isError = message.metadata?.error === true;
  const isSystem = message.type === 'system' || message.userId === 'system';
  const isSynced = message.metadata?.synced === true;
  const isExternal = message.metadata?.external === true;

  // Format message content
  const formattedContent = useMemo(() => {
    if (!enableMarkdown) {
      return message.content;
    }

    // Simple markdown-like formatting for now
    // In a real implementation, you'd use a proper markdown parser
    let content = message.content;
    
    // Bold text
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic text
    content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Code blocks
    content = content.replace(/```([\s\S]*?)```/g, '<pre class="bg-muted p-2 rounded text-sm overflow-x-auto"><code>$1</code></pre>');
    
    // Inline code
    content = content.replace(/`(.*?)`/g, '<code class="bg-muted px-1 rounded text-sm">$1</code>');
    
    // Line breaks
    content = content.replace(/\n/g, '<br>');

    return content;
  }, [message.content, enableMarkdown]);

  // Get message icon
  const getMessageIcon = () => {
    if (isSystem) {
      return isError ? <AlertCircle className="h-4 w-4" /> : <Bot className="h-4 w-4" />;
    }
    if (isCommand) {
      return <Terminal className="h-4 w-4" />;
    }
    if (isUser) {
      return <User className="h-4 w-4" />;
    }
    return <MessageSquare className="h-4 w-4" />;
  };

  // Get message styling
  const getMessageStyling = () => {
    if (isError) {
      return 'border-red-200 bg-red-50 text-red-900';
    }
    if (isSystem) {
      return 'border-blue-200 bg-blue-50 text-blue-900';
    }
    if (isCommand) {
      return 'border-purple-200 bg-purple-50 text-purple-900';
    }
    if (isUser) {
      return 'border-green-200 bg-green-50 text-green-900 ml-8';
    }
    return 'border-gray-200 bg-gray-50 text-gray-900 mr-8';
  };

  // Get source badge
  const getSourceBadge = () => {
    if (message.source === 'telegram') {
      return (
        <Badge variant="outline" className="text-xs">
          📱 Telegram
        </Badge>
      );
    }
    if (message.source === 'web') {
      return (
        <Badge variant="outline" className="text-xs">
          🌐 Web
        </Badge>
      );
    }
    return null;
  };

  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${getMessageStyling()}`}>
      <div className="flex-shrink-0 mt-0.5">
        {getMessageIcon()}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">
            {isSystem ? 'System' : isUser ? 'You' : 'Assistant'}
          </span>
          
          {getSourceBadge()}
          
          {isSynced && (
            <Badge variant="outline" className="text-xs">
              Synced
            </Badge>
          )}
          
          {isExternal && (
            <Badge variant="outline" className="text-xs">
              External
            </Badge>
          )}
          
          {showTimestamp && (
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(new Date(message.timestamp))}
            </span>
          )}
        </div>
        
        <div 
          className="text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: formattedContent }}
        />
        
        {/* Show command metadata if available */}
        {isCommand && message.metadata?.suggestions && (
          <div className="mt-2 text-xs text-muted-foreground">
            <div className="font-medium mb-1">Suggestions:</div>
            <ul className="list-disc list-inside space-y-0.5">
              {message.metadata.suggestions.map((suggestion: string, index: number) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Show error details if available */}
        {isError && message.metadata?.errorCode && (
          <div className="mt-2 text-xs text-muted-foreground">
            Error Code: {message.metadata.errorCode}
          </div>
        )}
        
        {/* Show response metadata if available */}
        {message.type === 'response' && message.metadata?.responseType && (
          <div className="mt-1 text-xs text-muted-foreground">
            Format: {message.metadata.responseType}
          </div>
        )}
      </div>
    </div>
  );
}