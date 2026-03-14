'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { useAppToast } from '@/components/layout/app-shell';
import { projectsApi, type Card, type CreateCardRequest } from '@/lib/api';

interface CreateCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId: string;
  columnId: string;
}

export function CreateCardDialog({ open, onOpenChange, onSuccess, projectId, columnId }: CreateCardDialogProps) {
  const toast = useAppToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as Card['priority'],
    type: 'task' as Card['type'],
    tags: [] as string[],
    dueDate: '',
    newTag: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!formData.title.trim()) {
      toast.error('Card title is required');
      return;
    }

    setLoading(true);
    try {
      const cardData: CreateCardRequest = {
        columnId,
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        priority: formData.priority,
        type: formData.type,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        dueDate: formData.dueDate || undefined
      };
      
      await projectsApi.createCard(projectId, cardData);
      toast.success('Card created');
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create card');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      type: 'task',
      tags: [],
      dueDate: '',
      newTag: ''
    });
  };

  const handleCancel = () => {
    if (loading) return;
    onOpenChange(false);
    resetForm();
  };

  const handleAddTag = () => {
    const tag = formData.newTag.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({ 
        ...prev, 
        tags: [...prev.tags, tag],
        newTag: ''
      }));
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({ 
      ...prev, 
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New Card</DialogTitle>
          <DialogDescription>
            Add a new card to organize your work and track progress.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Card Title</Label>
            <Input
              id="title"
              placeholder="Enter card title..."
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Describe the card..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              disabled={loading}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value: Card['priority']) => setFormData(prev => ({ ...prev, priority: value }))}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: Card['type']) => setFormData(prev => ({ ...prev, type: value }))}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="epic">Epic</SelectItem>
                  <SelectItem value="story">Story</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDate">Due Date (Optional)</Label>
            <Input
              id="dueDate"
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label>Tags (Optional)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag..."
                value={formData.newTag}
                onChange={(e) => setFormData(prev => ({ ...prev, newTag: e.target.value }))}
                onKeyPress={handleTagKeyPress}
                disabled={loading}
              />
              <Button type="button" variant="outline" onClick={handleAddTag} disabled={loading || !formData.newTag.trim()}>
                Add
              </Button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-red-500"
                      disabled={loading}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Card'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}