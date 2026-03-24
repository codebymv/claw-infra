'use client';

import { useEffect, useState } from 'react';
import { projectsApi, type ProjectCodeActivity } from '@/lib/api';
import { GitCommit, GitPullRequest } from 'lucide-react';

interface CodeActivityProps {
  projectId: string;
}

export function CodeActivity({ projectId }: CodeActivityProps) {
  const [activity, setActivity] = useState<ProjectCodeActivity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivity();
  }, [projectId]);

  const loadActivity = async () => {
    try {
      setLoading(true);
      const data = await projectsApi.getActivity(projectId, 15);
      setActivity(data);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  };

  if (loading || !activity) return null;
  if (activity.commits.length === 0 && activity.prs.length === 0) return null;

  // Merge and sort by date
  type ActivityItem =
    | { type: 'commit'; date: string; data: ProjectCodeActivity['commits'][0] }
    | { type: 'pr'; date: string; data: ProjectCodeActivity['prs'][0] };

  const items: ActivityItem[] = [
    ...activity.commits.map((c) => ({
      type: 'commit' as const,
      date: c.committedAt,
      data: c,
    })),
    ...activity.prs.map((p) => ({
      type: 'pr' as const,
      date: p.openedAt,
      data: p,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const stateColor = (state: string) => {
    switch (state) {
      case 'merged':
        return 'text-purple-600 dark:text-purple-400';
      case 'open':
        return 'text-green-600 dark:text-green-400';
      case 'closed':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <GitCommit className="h-5 w-5 text-green-500" />
          Code Activity
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {activity.commits.length} commit{activity.commits.length !== 1 ? 's' : ''},{' '}
          {activity.prs.length} PR{activity.prs.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {items.slice(0, 15).map((item) => {
          if (item.type === 'commit') {
            const c = item.data;
            return (
              <div
                key={c.id}
                className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3"
              >
                <GitCommit className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {c.message}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{c.author}</span>
                    <span>{c.sha.slice(0, 7)}</span>
                    <span className="text-green-600 dark:text-green-400">+{c.additions}</span>
                    <span className="text-red-600 dark:text-red-400">-{c.deletions}</span>
                    <span>{new Date(c.committedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          } else {
            const p = item.data;
            return (
              <div
                key={p.id}
                className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3"
              >
                <GitPullRequest className={`h-4 w-4 mt-0.5 shrink-0 ${stateColor(p.state)}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    #{p.number} {p.title}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{p.author}</span>
                    <span className={stateColor(p.state)}>{p.state}</span>
                    <span className="text-green-600 dark:text-green-400">+{p.additions}</span>
                    <span className="text-red-600 dark:text-red-400">-{p.deletions}</span>
                    <span>{new Date(p.openedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          }
        })}
      </div>
    </div>
  );
}
