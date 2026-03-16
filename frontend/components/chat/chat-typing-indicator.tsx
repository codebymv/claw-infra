'use client';

import { MessageSquare } from 'lucide-react';

export function ChatTypingIndicator() {
  return (
    <div className="flex gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 mr-8">
      <div className="flex-shrink-0 mt-0.5">
        <MessageSquare className="h-4 w-4" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">Assistant</span>
          <span className="text-xs text-muted-foreground">typing...</span>
        </div>
        
        <div className="flex items-center gap-1">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}