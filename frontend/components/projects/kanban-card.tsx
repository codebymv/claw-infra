'use client';

import { useState } from 'react';
import { type Card } from '@/lib/api';
import { Calendar, MessageSquare, User, GripVertical } from 'lucide-react';

interface KanbanCardProps {
  card: Card;
  onDragStart: (card: Card) => void;
  onDragEnd: () => void;
  onUpdate: () => void;
  onCardClick: (cardId: string) => void;
}

export function KanbanCard({ card, onDragStart, onDragEnd, onUpdate, onCardClick }: KanbanCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    onDragStart(card);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.id);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd();
  };

  const handleClick = () => {
    onCardClick(card.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCardClick(card.id);
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'urgent':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'blocked':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  return (
    <div
      role="article"
      aria-label={`Card: ${card.title}${card.priority ? `, Priority: ${card.priority}` : ''}${card.status ? `, Status: ${card.status}` : ''}`}
      aria-roledescription="draggable card"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={`bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
        isDragging ? 'opacity-50 rotate-2' : ''
      }`}
    >
      {/* Drag Handle */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500" aria-hidden="true">
          <GripVertical className="h-4 w-4" />
        </div>
      </div>

      {/* Card Header */}
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2 flex-1">
          {card.title}
        </h4>
        {card.priority && (
          <span className={`text-xs px-2 py-1 rounded-full ml-2 ${getPriorityColor(card.priority)}`}>
            {card.priority}
          </span>
        )}
      </div>

      {/* Card Description */}
      {card.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
          {card.description}
        </p>
      )}

      {/* Card Tags */}
      {card.tags && card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3" role="list" aria-label="Tags">
          {card.tags.slice(0, 3).map((tag, index) => (
            <span
              key={index}
              role="listitem"
              className="text-xs px-2 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 rounded-full"
            >
              {tag}
            </span>
          ))}
          {card.tags.length > 3 && (
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded-full" aria-label={`${card.tags.length - 3} more tags`}>
              +{card.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Card Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center space-x-3">
          {card.assigneeId && (
            <div className="flex items-center" aria-label={`Assigned to user ${card.assigneeId}`}>
              <User className="h-3 w-3 mr-1" aria-hidden="true" />
              <span>Assigned</span>
            </div>
          )}
          {card.dueDate && (
            <div className="flex items-center" aria-label={`Due date: ${new Date(card.dueDate).toLocaleDateString()}`}>
              <Calendar className="h-3 w-3 mr-1" aria-hidden="true" />
              <span>{new Date(card.dueDate).toLocaleDateString()}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {card.comments && card.comments.length > 0 && (
            <div className="flex items-center" aria-label={`${card.comments.length} comments`}>
              <MessageSquare className="h-3 w-3 mr-1" aria-hidden="true" />
              <span>{card.comments.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Status Badge */}
      {card.status && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(card.status)}`}>
            {card.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}