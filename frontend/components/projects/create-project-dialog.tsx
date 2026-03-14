'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppToast } from '@/components/layout/app-shell';
import { projectsApi, type Project, type CreateProjectRequest } from '@/lib/api/projects';

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (project: Project) => void;
}

const templates = [
  {
    id: 'basic',
    name: 'Basic Kanban',
    description: 'Simple To Do, In Progress, Done columns',
    columns: ['To Do', 'In Progress', 'Done']
  },
  {
    id: 'software',
    name: 'Software Development',
    description: 'Backlog, To Do, In Progress, Review, Done',
    columns: ['Backlog', 'To Do', 'In Progress', 'Review', 'Done']
  },
  {
    id: 'marketing',
    name: 'Marketing Campaign',
    description: 'Ideas, Planning, In Progress, Review, Published',
    columns: ['Ideas', 'Planning', 'In Progress', 'Review', 'Published']
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Start with default columns and customize later',
    columns: ['To Do', 'In Progress', 'Done']
  }
];

export function CreateProjectDialog({ open, onOpenChange, onSuccess }: CreateProjectDialogProps) {
  const toast = useAppToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    template: 'basic' as CreateProjectRequest['template']
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!formData.name.trim()) {
      toast.error('Project name is required');
      return;
    }

    setLoading(true);
    try {
      const selectedTemplate = templates.find(t => t.id === formData.template);
      const project = await projectsApi.createProject({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        template: formData.template,
        settings: {
          defaultColumns: selectedTemplate?.columns || ['To Do', 'In Progress', 'Done'],
          workflowRules: {},
          customFields: []
        }
      });
      
      onSuccess(project);
      onOpenChange(false);
      setFormData({ name: '', description: '', template: 'basic' });
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (loading) return;
    onOpenChange(false);
    setFormData({ name: '', description: '', template: 'basic' });
  };

  const selectedTemplate = templates.find(t => t.id === formData.template);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Set up a new Kanban project to organize your work and track progress.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              placeholder="Enter project name..."
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
              placeholder="Describe your project..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              disabled={loading}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template">Template</Label>
            <Select
              value={formData.template}
              onValueChange={(value) => setFormData(prev => ({ ...prev, template: value as CreateProjectRequest['template'] }))}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div>
                      <div className="font-medium">{template.name}</div>
                      <div className="text-xs text-muted-foreground">{template.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplate && (
              <div className="text-xs text-muted-foreground">
                Columns: {selectedTemplate.columns.join(' → ')}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}