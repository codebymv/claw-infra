'use client';

import { useEffect, useState } from 'react';
import { projectsApi, githubApi, type LinkedRepo, type GithubAccessibleRepo } from '@/lib/api';
import { GitBranch, Plus, X, Loader2 } from 'lucide-react';

interface RepoLinkerProps {
  projectId: string;
}

export function RepoLinker({ projectId }: RepoLinkerProps) {
  const [linkedRepos, setLinkedRepos] = useState<LinkedRepo[]>([]);
  const [availableRepos, setAvailableRepos] = useState<GithubAccessibleRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);

  useEffect(() => {
    loadLinkedRepos();
  }, [projectId]);

  const loadLinkedRepos = async () => {
    try {
      setLoading(true);
      const repos = await projectsApi.getLinkedRepos(projectId);
      setLinkedRepos(repos);
    } catch {
      // Silently handle - repos section just won't show data
    } finally {
      setLoading(false);
    }
  };

  const openPicker = async () => {
    setShowPicker(true);
    try {
      const repos = await githubApi.listRepos();
      setAvailableRepos(repos);
    } catch {
      setAvailableRepos([]);
    }
  };

  const handleLink = async (repoFullName: string) => {
    try {
      setLinking(repoFullName);
      const updated = await projectsApi.linkRepo(projectId, repoFullName);
      setLinkedRepos(updated);
      setShowPicker(false);
    } catch {
      // Could show toast here
    } finally {
      setLinking(null);
    }
  };

  const handleUnlink = async (repoId: string) => {
    try {
      setUnlinking(repoId);
      await projectsApi.unlinkRepo(projectId, repoId);
      setLinkedRepos((prev) => prev.filter((r) => r.id !== repoId));
    } catch {
      // Could show toast here
    } finally {
      setUnlinking(null);
    }
  };

  if (loading) return null;

  const linkedFullNames = new Set(linkedRepos.map((r) => `${r.owner}/${r.name}`));
  const unlinkedRepos = availableRepos.filter((r) => !linkedFullNames.has(r.full_name));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-purple-500" />
          Linked Repositories
        </h3>
        <button
          onClick={openPicker}
          className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Link Repo
        </button>
      </div>

      {linkedRepos.length === 0 && !showPicker ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No repositories linked yet. Link a repo to track code activity.
        </p>
      ) : (
        <div className="space-y-2">
          {linkedRepos.map((repo) => (
            <div
              key={repo.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {repo.owner}/{repo.name}
                </span>
                {repo.defaultBranch && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    ({repo.defaultBranch})
                  </span>
                )}
              </div>
              <button
                onClick={() => handleUnlink(repo.id)}
                disabled={unlinking === repo.id}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
              >
                {unlinking === repo.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {showPicker && (
        <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Available Repositories
            </span>
            <button
              onClick={() => setShowPicker(false)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
          {unlinkedRepos.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {availableRepos.length === 0
                ? 'No repositories available. Connect GitHub in Settings first.'
                : 'All available repositories are already linked.'}
            </p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {unlinkedRepos.map((repo) => (
                <button
                  key={repo.full_name}
                  onClick={() => handleLink(repo.full_name)}
                  disabled={linking === repo.full_name}
                  className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  <span className="truncate">{repo.full_name}</span>
                  {linking === repo.full_name ? (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  ) : (
                    <Plus className="h-4 w-4 text-gray-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
