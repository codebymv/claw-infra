'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, Users, Calendar, Archive, Trash2, Edit, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatRelativeTime } from '@/lib/utils';
import { useAppToast } from '@/components/layout/app-shell';
import { projectsApi, type Project } from '@/lib/api/projects';

interface ProjectCardProps {
  project: Project;
  viewMode: 'grid' | 'list';
  onUpdate: (project: Project) => void;
  onDelete: (projectId: string) => void;
}

export function ProjectCard({ project, viewMode, onUpdate, onDelete }: ProjectCardProps) {
  const toast = useAppToast();
  const [loading, setLoading] = useState(false);

  const handleArchive = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const updated = await projectsApi.archiveProject(project.id);
      onUpdate(updated);
      toast.success('Project archived');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to archive project');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (loading) return;
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }
    setLoading(true);
    try {
      await projectsApi.deleteProject(project.id);
      onDelete(project.id);
      toast.success('Project deleted');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to delete project');
    } finally {
      setLoading(false);
    }
  };

  const completionRate = project.cardCount && project.completedCardCount 
    ? Math.round((project.completedCardCount / project.cardCount) * 100)
    : 0;

  if (viewMode === 'list') {
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Link 
                    href={`/projects/${project.id}`}
                    className="font-medium text-foreground hover:text-primary transition-colors truncate"
                  >
                    {project.name}
                  </Link>
                  {project.archivedAt && (
                    <Badge variant="secondary" className="text-xs">
                      Archived
                    </Badge>
                  )}
                </div>
                {project.description && (
                  <p className="text-sm text-muted-foreground truncate">
                    {project.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>{project.memberCount || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{formatRelativeTime(project.updatedAt)}</span>
                </div>
                {project.cardCount !== undefined && (
                  <div className="text-xs">
                    {project.completedCardCount || 0}/{project.cardCount} cards
                    {completionRate > 0 && (
                      <span className="ml-1 text-primary">({completionRate}%)</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href={`/projects/${project.id}`}>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={loading}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleArchive}>
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Link 
                href={`/projects/${project.id}`}
                className="font-medium text-foreground hover:text-primary transition-colors truncate"
              >
                {project.name}
              </Link>
              {project.archivedAt && (
                <Badge variant="secondary" className="text-xs">
                  Archived
                </Badge>
              )}
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {project.description}
              </p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={loading}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleArchive}>
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{project.memberCount || 0} members</span>
            </div>
            {project.cardCount !== undefined && (
              <div>
                {project.completedCardCount || 0}/{project.cardCount} cards
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{formatRelativeTime(project.updatedAt)}</span>
          </div>
        </div>
        {completionRate > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-primary font-medium">{completionRate}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-primary rounded-full h-2 transition-all duration-300"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}