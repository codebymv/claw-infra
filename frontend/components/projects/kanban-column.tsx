'use client';

import { useState } from 'react';
import { type Column, type Card } from '@/lib/api';
import { Plus, MoreVertical, Edit, Trash2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { KanbanCard } from './kanban-card';
import { ColumnManagementDialog } from './column-management-dialog';
import { CreateCardDialog } from './create-card-dialog';

interface KanbanColumnProps {
  column: Column;
  cards: Card[];
  projectId: string;
  onCardDragStart: (card: Card) => void;
  onCardDragEnd: () => void;
  onCardDrop: (columnId: string, position: number) => void;
  onCardUpdate: () => void;
  onColumnUpdate: () => void;
  onColumnDelete: (columnId: string) => void;
  onCardClick: (cardId: string) => void;
  isDraggedOver: boolean;
}

export function KanbanColumn({
  column,
  cards,
  projectId,
  onCardDragStart,
  onCardDragEnd,
  onCardDrop,
  onCardUpdate,
  onColumnUpdate,
  onColumnDelete,
  onCardClick,
  isDraggedOver
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createCardDialogOpen, setCreateCardDialogOpen] = useState(false);

  // Sort cards by position
  const sortedCards = cards.sort((a, b) => a.position - b.position);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const position = sortedCards.length;
    onCardDrop(column.id, position);
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete the "${column.name}" column? This will also delete all cards in this column.`)) {
      onColumnDelete(column.id);
    }
  };

  const wipLimitReached = column.wipLimit && sortedCards.length >= column.wipLimit;
  const wipLimitWarning = column.wipLimit && sortedCards.length >= column.wipLimit * 0.8;

  return (
    <div className="flex-shrink-0 w-80">
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
        {/* Column Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <h3 className="font-medium text-gray-900 dark:text-white">
              {column.name}
            </h3>
            <span className={`text-xs px-2 py-1 rounded-full ${
              wipLimitReached 
                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                : wipLimitWarning
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {sortedCards.length}{column.wipLimit ? `/${column.wipLimit}` : ''}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Column
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="h-4 w-4 mr-2" />
                Column Rules
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Cards Container */}
        <div
          className={`min-h-[200px] space-y-3 ${
            isDragOver ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-lg p-2' : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {sortedCards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
              onUpdate={onCardUpdate}
              onCardClick={onCardClick}
            />
          ))}
          
          {sortedCards.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
              No cards in this column
            </div>
          )}
        </div>

        {/* Add Card Button */}
        <Button
          variant="ghost"
          size="sm"
          className={`w-full mt-3 justify-start ${
            wipLimitReached ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={wipLimitReached}
          onClick={() => setCreateCardDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Card
        </Button>
      </div>

      {/* Column Management Dialog */}
      <ColumnManagementDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={onColumnUpdate}
        projectId={projectId}
        column={column}
        mode="edit"
      />

      {/* Create Card Dialog */}
      <CreateCardDialog
        open={createCardDialogOpen}
        onOpenChange={setCreateCardDialogOpen}
        onSuccess={onCardUpdate}
        projectId={projectId}
        columnId={column.id}
      />
    </div>
  );
}