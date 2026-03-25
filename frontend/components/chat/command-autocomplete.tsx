'use client';

import { useState, useEffect, useRef } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';

export interface CommandSuggestion {
  command: string;
  description: string;
  syntax?: string;
  examples?: string[];
  category: 'project' | 'chat' | 'system' | 'help';
}

interface CommandAutocompleteProps {
  input: string;
  onSelect: (command: string) => void;
  onClose: () => void;
  isVisible: boolean;
  position: { top: number; left: number };
}

const AVAILABLE_COMMANDS: CommandSuggestion[] = [
  {
    command: '/help',
    description: 'Show available commands and help information',
    syntax: '/help [command]',
    examples: ['/help', '/help projects'],
    category: 'help',
  },
  {
    command: '/projects',
    description: 'List all available projects',
    syntax: '/projects [filter]',
    examples: ['/projects', '/projects active'],
    category: 'project',
  },
  {
    command: '/select',
    description: 'Select a project to work with',
    syntax: '/select <project-name>',
    examples: ['/select my-project', '/select "Project Name"'],
    category: 'project',
  },
  {
    command: '/context',
    description: 'Show current session context and project information',
    syntax: '/context',
    examples: ['/context'],
    category: 'chat',
  },
  {
    command: '/clear',
    description: 'Clear current project context',
    syntax: '/clear',
    examples: ['/clear'],
    category: 'project',
  },
  {
    command: '/status',
    description: 'Show chat session status and statistics',
    syntax: '/status',
    examples: ['/status'],
    category: 'chat',
  },
  {
    command: '/history',
    description: 'Show recent message history',
    syntax: '/history [limit]',
    examples: ['/history', '/history 20'],
    category: 'chat',
  },
  {
    command: '/search',
    description: 'Search through past chat messages',
    syntax: '/search <query>',
    examples: ['/search deploy error', '/search database'],
    category: 'chat',
  },
];

export function CommandAutocomplete({ 
  input, 
  onSelect, 
  onClose, 
  isVisible, 
  position 
}: CommandAutocompleteProps) {
  const [filteredCommands, setFilteredCommands] = useState<CommandSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter commands based on input
  useEffect(() => {
    if (!input.startsWith('/')) {
      setFilteredCommands([]);
      return;
    }

    const query = input.toLowerCase();
    const filtered = AVAILABLE_COMMANDS.filter(cmd => 
      cmd.command.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query.slice(1)) // Remove the '/' for description search
    ).slice(0, 8); // Limit to 8 suggestions

    setFilteredCommands(filtered);
    setSelectedIndex(0);
  }, [input]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible || filteredCommands.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
          break;
        case 'Enter':
          if (filteredCommands[selectedIndex]) {
            e.preventDefault();
            onSelect(filteredCommands[selectedIndex].command);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, filteredCommands, selectedIndex, onSelect, onClose]);

  // Handle clicks outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVisible, onClose]);

  if (!isVisible || filteredCommands.length === 0) {
    return null;
  }

  const getCategoryColor = (category: CommandSuggestion['category']) => {
    switch (category) {
      case 'project': return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25';
      case 'chat': return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25';
      case 'system': return 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/25';
      case 'help': return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-96 bg-popover border border-border rounded-lg shadow-lg"
      style={{
        top: position.top - 8, // Position above the input
        left: position.left,
        transform: 'translateY(-100%)',
      }}
    >
      <div className="p-2">
        <div className="text-xs text-muted-foreground mb-2 px-2">
          Command Suggestions
        </div>
        <div className="space-y-1">
          {filteredCommands.map((cmd, index) => (
            <div
              key={cmd.command}
              className={`p-2 rounded cursor-pointer transition-colors ${
                index === selectedIndex 
                  ? 'bg-primary/10 border border-primary/25' 
                  : 'hover:bg-accent'
              }`}
              onClick={() => onSelect(cmd.command)}
            >
              <div className="flex items-center justify-between mb-1">
                <code className="text-sm font-mono font-medium text-primary">
                  {cmd.command}
                </code>
                <Badge 
                  variant="outline" 
                  className={`text-xs ${getCategoryColor(cmd.category)}`}
                >
                  {cmd.category}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mb-1">
                {cmd.description}
              </div>
              {cmd.syntax && (
                <div className="text-xs text-muted-foreground/70">
                  <span className="font-medium">Syntax:</span> <code>{cmd.syntax}</code>
                </div>
              )}
              {cmd.examples && cmd.examples.length > 0 && (
                <div className="text-xs text-muted-foreground/70 mt-1">
                  <span className="font-medium">Examples:</span>{' '}
                  {cmd.examples.map((example, i) => (
                    <span key={i}>
                      <code>{example}</code>
                      {i < cmd.examples!.length - 1 && ', '}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="text-xs text-muted-foreground mt-2 px-2 border-t pt-2">
          Use ↑↓ to navigate, Enter to select, Esc to close
        </div>
      </div>
    </div>
  );
}