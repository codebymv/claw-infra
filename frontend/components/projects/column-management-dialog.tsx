'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAppToast } from '@/components/layout/app-shell';
import { projectsApi, type Column, type CreateColumnRequest, type UpdateColumnRequest } from '@/lib/api';

interface ColumnManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId: string;
  column?: Column;
  mode: 'create' | 'edit';
}

export function ColumnManagementDialog({ 
  open, 
  onOpenChange, 
  onSuccess, 
  projectId, 
  column, 
  mode 
}: ColumnManagementDialogProps) {
  const toast = useAppToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: column?.name || '',
    description: column?.description || '',
    wipLimit: column?.wipLimit?.toString() || ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!formData.name.trim()) {
      toast.error('Column name is required');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'create') {
        const data: CreateColumnRequest = {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          wipLimit: formData.wipLimit ? parseInt(formData.wipLimit) : undefined
        };
        await projectsApi.createColumn(projectId, data);
        toast.success('Column created');
      } else if (column) {
        const data: UpdateColumnRequest = {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          wipLimit: formData.wipLimit ? parseInt(formData.wipLimit) : undefined
        };
        await projectsApi.updateColumn(projectId, column.id, data);
        toast.success('Column updated');
      }
      
      onSuccess();
      onOpenChange(false);
      setFormData({ name: '', description: '', wipLimit: '' });
    } catch (err) {
      toast.error((err as Error).message || `Failed to ${mode} column`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (loading) return;
    onOpenChange(false);
    setFormData({ name: '', description: '', wipLimit: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create New Column' : 'Edit Column'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' 
              ? 'Add a new column to organize your cards.'
              : 'Update the column settings.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Column Name</Label>
            <Input
              id="name"
              placeholder="Enter column name..."
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Describe this column..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              disabled={loading}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wipLimit">WIP Limit (Optional)</Label>
            <Input
              id="wipLimit"
              type="number"
              min="1"
              placeholder="Maximum cards in this column"
              value={formData.wipLimit}
              onChange={(e) => setFormData(prev => ({ ...prev, wipLimit: e.target.value }))}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Work-in-progress limit helps prevent bottlenecks
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (mode === 'create' ? 'Creating...' : 'Updating...') : (mode === 'create' ? 'Create Column' : 'Update Column')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}