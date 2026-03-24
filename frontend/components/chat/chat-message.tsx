'use client';

import { useMemo } from 'react';
import { Bot, User, Terminal, AlertCircle, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils';
import { ChatMessageData } from './web-chat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

  const isRunStatus = message.metadata?.runStatus === true;

  // Format message content
  const formattedContent = useMemo(() => {
    return message.content;
  }, [message.content]);

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
      return 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300';
    }
    if (isSystem) {
      return 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300';
    }
    if (isCommand) {
      return 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300';
    }
    if (isUser) {
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ml-8';
    }
    return 'border-border bg-muted/30 text-foreground mr-8';
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
        
        {/* Inline run status card */}
        {isRunStatus && message.metadata && (
          <a
            href={`/agents/${message.metadata.runId}`}
            className="block mt-1 p-2 rounded border bg-muted/50 hover:bg-muted transition-colors no-underline"
          >
            <div className="flex items-center gap-2 text-sm">
              <span className={`inline-block w-2 h-2 rounded-full ${
                message.metadata.status === 'completed' ? 'bg-green-500' :
                message.metadata.status === 'running' ? 'bg-blue-500 animate-pulse' :
                message.metadata.status === 'failed' ? 'bg-red-500' :
                'bg-yellow-500'
              }`} />
              <span className="font-medium">{message.metadata.agentName || 'Agent'}</span>
              <Badge variant="outline" className="text-xs capitalize">{message.metadata.status}</Badge>
              {message.metadata.duration != null && (
                <span className="text-xs text-muted-foreground">{Math.round(message.metadata.duration)}s</span>
              )}
              {message.metadata.cost != null && (
                <span className="text-xs text-muted-foreground">${Number(message.metadata.cost).toFixed(4)}</span>
              )}
            </div>
          </a>
        )}

        {/* Regular message content */}
        {!isRunStatus && (enableMarkdown ? (
          <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-pre:my-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {formattedContent}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {formattedContent}
          </div>
        ))}
        
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