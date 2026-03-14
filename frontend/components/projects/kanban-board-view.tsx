'use client';

import { useState } from 'react';
import { type KanbanBoard, type Card, type Column, projectsApi } from '@/lib/api';
import { Plus, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KanbanColumn } from './kanban-column';
import { ColumnManagementDialog } from './column-management-dialog';
import { CardDetailModal } from './card-detail-modal';

interface KanbanBoardViewProps {
  board: KanbanBoard;
  cards: Card[];
  onCardUpdate: () => void;
  onCardMove: () => void;
}

export function KanbanBoardView({ board, cards, onCardUpdate, onCardMove }: KanbanBoardViewProps) {
  const [draggedCard, setDraggedCard] = useState<Card | null>(null);
  const [createColumnDialogOpen, setCreateColumnDialogOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [cardDetailModalOpen, setCardDetailModalOpen] = useState(false);

  // Group cards by column
  const cardsByColumn = cards.reduce((acc, card) => {
    if (!acc[card.columnId]) {
      acc[card.columnId] = [];
    }
    acc[card.columnId].push(card);
    return acc;
  }, {} as Record<string, Card[]>);

  // Sort columns by position
  const sortedColumns = board.columns?.sort((a, b) => a.position - b.position) || [];

  const handleDragStart = (card: Card) => {
    setDraggedCard(card);
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
  };

  const handleDrop = async (columnId: string, position: number) => {
    if (!draggedCard || draggedCard.columnId === columnId) {
      return;
    }

    try {
      // Call the API to move the card
      await projectsApi.moveCard(board.projectId, draggedCard.id, { columnId, position });
      onCardMove();
    } catch (error) {
      console.error('Failed to move card:', error);
    }
  };

  const handleCardClick = (cardId: string) => {
    setSelectedCardId(cardId);
    setCardDetailModalOpen(true);
  };

  const handleColumnDelete = async (columnId: string) => {
    try {
      await projectsApi.deleteColumn(board.projectId, columnId);
      onCardMove(); // Refresh the board
    } catch (error) {
      console.error('Failed to delete column:', error);
    }
  };

  if (!board.columns || board.columns.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-gray-400">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            No Columns
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Add columns to organize your cards.
          </p>
          <div className="mt-6">
            <Button onClick={() => setCreateColumnDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Column
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex space-x-6 overflow-x-auto pb-6">
      {sortedColumns.map((column) => (
        <KanbanColumn
          key={column.id}
          column={column}
          cards={cardsByColumn[column.id] || []}
          projectId={board.projectId}
          onCardDragStart={handleDragStart}
          onCardDragEnd={handleDragEnd}
          onCardDrop={handleDrop}
          onCardUpdate={onCardUpdate}
          onColumnUpdate={onCardMove}
          onColumnDelete={handleColumnDelete}
          onCardClick={handleCardClick}
          isDraggedOver={draggedCard?.columnId !== column.id}
        />
      ))}
      
      {/* Add Column Button */}
      <div className="flex-shrink-0 w-80">
        <Button
          variant="outline"
          className="w-full h-12 border-2 border-dashed"
          onClick={() => setCreateColumnDialogOpen(true)}
        >
          <Plus className="h-5 w-5 mr-2" />
          Add Column
        </Button>
      </div>

      {/* Create Column Dialog */}
      <ColumnManagementDialog
        open={createColumnDialogOpen}
        onOpenChange={setCreateColumnDialogOpen}
        onSuccess={onCardMove}
        projectId={board.projectId}
        mode="create"
      />

      {/* Card Detail Modal */}
      <CardDetailModal
        open={cardDetailModalOpen}
        onOpenChange={setCardDetailModalOpen}
        projectId={board.projectId}
        cardId={selectedCardId}
        onUpdate={onCardUpdate}
      />
    </div>
  );
}