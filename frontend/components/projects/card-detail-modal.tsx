'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, User, MessageSquare, Paperclip, Clock, Tag, Edit, Save, X, Cpu } from 'lucide-react';
import { useAppToast } from '@/components/layout/app-shell';
import { projectsApi, agentsApi, type Card, type Comment, type UpdateCardRequest, type CreateCommentRequest, type AgentRun } from '@/lib/api';
import { StatusBadge } from '@/components/shared/status-badge';
import Link from 'next/link';

interface CardDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  cardId: string | null;
  onUpdate: () => void;
}

export function CardDetailModal({ open, onOpenChange, projectId, cardId, onUpdate }: CardDetailModalProps) {
  const toast = useAppToast();
  const [card, setCard] = useState<Card | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [linkedRuns, setLinkedRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as Card['priority'],
    type: 'task' as Card['type'],
    tags: [] as string[],
    dueDate: ''
  });

  useEffect(() => {
    if (open && cardId) {
      loadCardData();
    }
  }, [open, cardId, projectId]);

  const loadCardData = async () => {
    if (!cardId) return;
    
    setLoading(true);
    try {
      const [cardData, commentsData, runsData] = await Promise.all([
        projectsApi.getCard(projectId, cardId),
        projectsApi.getComments(projectId, cardId),
        agentsApi.getCardRuns(cardId).catch(() => [] as AgentRun[]),
      ]);
      
      setCard(cardData);
      setComments(commentsData);
      setLinkedRuns(runsData);
      setFormData({
        title: cardData.title,
        description: cardData.description || '',
        priority: cardData.priority,
        type: cardData.type,
        tags: cardData.tags || [],
        dueDate: cardData.dueDate ? cardData.dueDate.split('T')[0] : ''
      });
    } catch (err) {
      toast.error((err as Error).message || 'Failed to load card');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!card) return;
    
    setLoading(true);
    try {
      const updateData: UpdateCardRequest = {
        title: formData.title,
        description: formData.description || undefined,
        priority: formData.priority,
        type: formData.type,
        tags: formData.tags,
        dueDate: formData.dueDate || undefined
      };
      
      await projectsApi.updateCard(projectId, card.id, updateData);
      toast.success('Card updated');
      setEditing(false);
      onUpdate();
      loadCardData();
    } catch (err) {
      toast.error((err as Error).message || 'Failed to update card');
    } finally {
      setLoading(false);
    }
  };
  const handleAddComment = async () => {
    if (!card || !newComment.trim()) return;
    
    setLoading(true);
    try {
      const commentData: CreateCommentRequest = {
        content: newComment.trim()
      };
      
      await projectsApi.createComment(projectId, card.id, commentData);
      setNewComment('');
      loadCardData();
    } catch (err) {
      toast.error((err as Error).message || 'Failed to add comment');
    } finally {
      setLoading(false);
    }
  };

  const handleTagAdd = (tag: string) => {
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, tag] }));
    }
  };

  const handleTagRemove = (tagToRemove: string) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(tag => tag !== tagToRemove) }));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'urgent': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'feature': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
      case 'bug': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'epic': return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200';
      case 'story': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  if (!card && !loading) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">
              {editing ? 'Edit Card' : card?.title || 'Loading...'}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {!editing ? (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={loading}>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>
        
        {loading && !card ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : card && (
          <div className="space-y-6">
            {/* Card Header */}
            <div className="flex items-start gap-4">
              <div className="flex-1 space-y-4">
                {editing ? (
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      disabled={loading}
                    />
                  </div>
                ) : (
                  <h2 className="text-2xl font-semibold">{card.title}</h2>
                )}
                
                {editing ? (
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      disabled={loading}
                      rows={4}
                    />
                  </div>
                ) : (
                  card.description && (
                    <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                      {card.description}
                    </p>
                  )
                )}
              </div>
              
              <div className="flex flex-col gap-2">
                <Badge className={getPriorityColor(editing ? formData.priority : card.priority)}>
                  {editing ? formData.priority : card.priority}
                </Badge>
                <Badge className={getTypeColor(editing ? formData.type : card.type)}>
                  {editing ? formData.type : card.type}
                </Badge>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 my-6"></div>

            {/* Card Properties */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Properties
                </h3>
                
                {editing ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select
                        value={formData.priority}
                        onValueChange={(value: Card['priority']) => setFormData(prev => ({ ...prev, priority: value }))}
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
                      <Label>Type</Label>
                      <Select
                        value={formData.type}
                        onValueChange={(value: Card['type']) => setFormData(prev => ({ ...prev, type: value }))}
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
                    
                    <div className="space-y-2">
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={formData.dueDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                        disabled={loading}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <span>Assignee: {card.assignee?.displayName || 'Unassigned'}</span>
                    </div>
                    {card.dueDate && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>Due: {new Date(card.dueDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span>Created: {new Date(card.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tags
                </h3>
                
                <div className="flex flex-wrap gap-2">
                  {(editing ? formData.tags : card.tags || []).map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {tag}
                      {editing && (
                        <button
                          onClick={() => handleTagRemove(tag)}
                          className="ml-1 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 my-6"></div>

            {/* Linked Agent Runs */}
            {linkedRuns.length > 0 && (
              <>
                <div className="space-y-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    Linked Runs ({linkedRuns.length})
                  </h3>
                  <div className="space-y-2">
                    {linkedRuns.map((run) => (
                      <Link
                        key={run.id}
                        href={`/agents/${run.id}`}
                        className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        onClick={() => onOpenChange(false)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <StatusBadge status={run.status} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{run.agentName}</p>
                            <p className="text-xs text-gray-500">
                              {run.startedAt ? new Date(run.startedAt).toLocaleString() : 'Queued'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                          {run.durationMs != null && (
                            <span>{(run.durationMs / 1000).toFixed(1)}s</span>
                          )}
                          {run.totalCostUsd && parseFloat(run.totalCostUsd) > 0 && (
                            <span>${parseFloat(run.totalCostUsd).toFixed(4)}</span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 my-6"></div>
              </>
            )}

            {/* Comments Section */}
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comments ({comments.length})
              </h3>
              
              <div className="space-y-4">
                <div className="flex gap-3">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    disabled={loading}
                    rows={3}
                  />
                  <Button onClick={handleAddComment} disabled={loading || !newComment.trim()}>
                    Add
                  </Button>
                </div>
                
                {comments.map((comment) => (
                  <div key={comment.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {comment.author?.displayName || 'Unknown User'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(comment.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                  </div>
                ))}
                
                {comments.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No comments yet. Be the first to add one!
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}