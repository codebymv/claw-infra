'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, AlertCircle, Wifi, WifiOff, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useChatSocket } from '@/hooks/use-chat-socket';
import { ChatMessage } from './chat-message';
import { ChatTypingIndicator } from './chat-typing-indicator';
import { CommandAutocomplete } from './command-autocomplete';
import { formatRelativeTime } from '@/lib/utils';
import { api, projectsApi } from '@/lib/api';

export interface ChatMessageData {
  id: string;
  content: string;
  source: 'web' | 'telegram';
  type: 'message' | 'command' | 'response' | 'system';
  timestamp: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface ChatSession {
  userId: string;
  sessionId: string;
  messageCount: number;
  activeProject?: string;
  preferences: {
    autoComplete: boolean;
    showTimestamps: boolean;
    markdownEnabled: boolean;
    crossPlatformSync: boolean;
  };
}

interface WebChatProps {
  className?: string;
}

export function WebChat({ className }: WebChatProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });
  const [availableProjects, setAvailableProjects] = useState<{ id: string; name: string }[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const {
    socket,
    isConnected,
    connectionStatus,
    sendMessage,
    startTyping,
    stopTyping,
  } = useChatSocket();

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load available projects for the selector
  useEffect(() => {
    projectsApi.list().then((data: any) => {
      const items = Array.isArray(data) ? data : data?.items ?? [];
      setAvailableProjects(items.map((p: any) => ({ id: p.id, name: p.name })));
    }).catch(() => {});
  }, []);

  // Handle project selection from picker
  const handleProjectSelect = useCallback((projectId: string | null) => {
    setShowProjectPicker(false);
    if (!isConnected) return;
    const projectName = availableProjects.find(p => p.id === projectId)?.name;
    if (projectId && projectName) {
      sendMessage({ content: `/select ${projectName}`, type: 'command' });
    } else {
      sendMessage({ content: '/clear', type: 'command' });
    }
  }, [isConnected, availableProjects, sendMessage]);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleConnected = (data: any) => {
      console.log('Chat connected:', data);
      setSession({
        userId: data.userId,
        sessionId: data.sessionId,
        messageCount: data.messageCount ?? 0,
        activeProject: data.activeProject,
        preferences: data.preferences ?? {
          autoComplete: true,
          showTimestamps: true,
          markdownEnabled: true,
          crossPlatformSync: true,
        },
      });
    };

    const handleMessageHistory = (data: { messages: ChatMessageData[] }) => {
      console.log('Received message history:', data.messages.length, 'messages');
      setMessages(data.messages);
    };

    const handleChatEvent = (event: ChatMessageData) => {
      console.log('Received chat event:', event);
      setMessages(prev => {
        // Avoid duplicate messages
        const exists = prev.some(msg => msg.id === event.id);
        if (exists) return prev;
        return [...prev, event];
      });
    };

    const handleMessageResponse = (response: any) => {
      console.log('Received message response:', response);
      setIsLoading(false);
      
      if (response.success && response.response) {
        const responseMessage: ChatMessageData = {
          id: `response_${Date.now()}`,
          content: response.response.content,
          source: 'web',
          type: 'response',
          timestamp: response.timestamp,
          userId: 'system',
          metadata: response.response.metadata,
        };
        setMessages(prev => [...prev, responseMessage]);
      }

      if (response.error) {
        const errorMessage: ChatMessageData = {
          id: `error_${Date.now()}`,
          content: `Error: ${response.error.message}`,
          source: 'web',
          type: 'system',
          timestamp: response.timestamp,
          userId: 'system',
          metadata: { error: true, errorCode: response.error.code },
        };
        setMessages(prev => [...prev, errorMessage]);
      }

      // Handle context updates
      if (response.contextUpdate && session) {
        setSession(prev => prev ? {
          ...prev,
          activeProject: response.contextUpdate.activeProjectId ?? prev.activeProject,
        } : null);
      }
    };

    const handleTypingStatus = (data: { userId: string; isTyping: boolean }) => {
      // Handle typing indicators from other sources (e.g., Telegram)
      if (data.userId !== session?.userId) {
        setIsTyping(data.isTyping);
      }
    };

    const handleError = (error: any) => {
      console.error('Chat socket error:', error);
      const errorMessage: ChatMessageData = {
        id: `socket_error_${Date.now()}`,
        content: `Connection error: ${error.message || 'Unknown error'}`,
        source: 'web',
        type: 'system',
        timestamp: new Date().toISOString(),
        userId: 'system',
        metadata: { error: true, socketError: true },
      };
      setMessages(prev => [...prev, errorMessage]);
    };

    const handleReconnect = () => {
      const reconnectMessage: ChatMessageData = {
        id: `reconnect_${Date.now()}`,
        content: 'Reconnected to chat server',
        source: 'web',
        type: 'system',
        timestamp: new Date().toISOString(),
        userId: 'system',
        metadata: { reconnect: true },
      };
      setMessages(prev => [...prev, reconnectMessage]);
    };

    socket.on('connection:established', handleConnected);
    socket.on('connected', handleConnected);
    socket.on('message_history', handleMessageHistory);
    socket.on('chat_event', handleChatEvent);
    socket.on('message_response', handleMessageResponse);
    socket.on('typing_status', handleTypingStatus);
    socket.on('error', handleError);
    socket.on('reconnect', handleReconnect);

    return () => {
      socket.off('connection:established', handleConnected);
      socket.off('connected', handleConnected);
      socket.off('message_history', handleMessageHistory);
      socket.off('chat_event', handleChatEvent);
      socket.off('message_response', handleMessageResponse);
      socket.off('typing_status', handleTypingStatus);
      socket.off('error', handleError);
      socket.off('reconnect', handleReconnect);
    };
  }, [socket, session?.userId]);

  // Handle input changes and typing indicators
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Handle command autocomplete
    if (value.startsWith('/') && value.length > 1) {
      if (!showAutocomplete) {
        // Calculate position for autocomplete
        const inputElement = inputRef.current;
        if (inputElement) {
          const rect = inputElement.getBoundingClientRect();
          setAutocompletePosition({
            top: rect.top,
            left: rect.left,
          });
        }
        setShowAutocomplete(true);
      }
    } else {
      setShowAutocomplete(false);
    }

    // Handle typing indicators
    if (value.length > 0 && !isTyping) {
      startTyping();
      setIsTyping(true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping) {
        stopTyping();
        setIsTyping(false);
      }
    }, 1000);
  };

  // Handle command selection from autocomplete
  const handleCommandSelect = (command: string) => {
    setInputValue(command + ' ');
    setShowAutocomplete(false);
    inputRef.current?.focus();
  };

  // Handle autocomplete close
  const handleAutocompleteClose = () => {
    setShowAutocomplete(false);
  };

  // Handle message submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || isLoading || !isConnected) {
      return;
    }

    const messageContent = inputValue.trim();
    const isCommand = messageContent.startsWith('/');
    
    setInputValue('');
    setIsLoading(true);

    // Stop typing indicator
    if (isTyping) {
      stopTyping();
      setIsTyping(false);
    }

    // Clear typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Add user message to UI immediately
    const userMessage: ChatMessageData = {
      id: `user_${Date.now()}`,
      content: messageContent,
      source: 'web',
      type: isCommand ? 'command' : 'message',
      timestamp: new Date().toISOString(),
      userId: session?.userId,
    };
    setMessages(prev => [...prev, userMessage]);

    // Send message via socket
    try {
      await sendMessage({
        content: messageContent,
        type: isCommand ? 'command' : 'message',
        projectId: session?.activeProject,
      });
    } catch (error) {
      setIsLoading(false);
      const errorMessage: ChatMessageData = {
        id: `error_${Date.now()}`,
        content: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        source: 'web',
        type: 'system',
        timestamp: new Date().toISOString(),
        userId: 'system',
        metadata: { error: true },
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Handle key press for shortcuts
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (showAutocomplete) {
        // Let autocomplete handle Enter key
        return;
      }
      e.preventDefault();
      handleSubmit(e);
    } else if (e.key === 'Escape') {
      if (showAutocomplete) {
        setShowAutocomplete(false);
      }
    }
  };

  // Connection status indicator
  const getConnectionStatusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-600/30 dark:border-emerald-400/30">
            <Wifi className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case 'connecting':
        return (
          <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-600/30 dark:border-amber-400/30">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Connecting
          </Badge>
        );
      case 'disconnected':
        return (
          <Badge variant="outline" className="text-rose-600 dark:text-rose-400 border-rose-600/30 dark:border-rose-400/30">
            <WifiOff className="h-3 w-3 mr-1" />
            Disconnected
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card className={`flex flex-col h-full ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Chat</CardTitle>
          <div className="flex items-center gap-2">
            {/* Project selector */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                onClick={() => setShowProjectPicker(!showProjectPicker)}
              >
                <FolderOpen className="h-3 w-3" />
                {session?.activeProject
                  ? availableProjects.find(p => p.id === session.activeProject)?.name ?? 'Project'
                  : 'No Project'}
              </Button>
              {showProjectPicker && (
                <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-popover border rounded-md shadow-md p-1">
                  <button
                    className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent text-muted-foreground"
                    onClick={() => handleProjectSelect(null)}
                  >
                    Clear project
                  </button>
                  {availableProjects.map(p => (
                    <button
                      key={p.id}
                      className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent ${session?.activeProject === p.id ? 'bg-accent font-medium' : ''}`}
                      onClick={() => handleProjectSelect(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {getConnectionStatusBadge()}
          </div>
        </div>
        {session && (
          <div className="text-sm text-muted-foreground">
            {session.messageCount} messages • Session: {session.sessionId.slice(0, 8)}...
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <div className="text-lg mb-2">Welcome to Chat!</div>
                <div className="text-sm">
                  Type a message or use commands like <code>/help</code> to get started.
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  showTimestamp={session?.preferences.showTimestamps ?? true}
                  enableMarkdown={session?.preferences.markdownEnabled ?? true}
                />
              ))}
              {isTyping && <ChatTypingIndicator />}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t p-4 relative">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={
                isConnected 
                  ? "Type a message or command..." 
                  : "Connecting..."
              }
              disabled={!isConnected || isLoading}
              className="flex-1"
            />
            <Button 
              type="submit" 
              disabled={!inputValue.trim() || !isConnected || isLoading}
              size="sm"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          
          {/* Command Autocomplete */}
          <CommandAutocomplete
            input={inputValue}
            onSelect={handleCommandSelect}
            onClose={handleAutocompleteClose}
            isVisible={showAutocomplete && session?.preferences.autoComplete !== false}
            position={autocompletePosition}
          />
          
          {!isConnected && (
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>
                {connectionStatus === 'connecting' 
                  ? 'Connecting to chat server...' 
                  : 'Disconnected from chat server'
                }
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}