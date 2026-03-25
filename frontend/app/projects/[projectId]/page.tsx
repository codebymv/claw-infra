'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { projectsApi, agentsApi, type Project, type KanbanBoard, type Card, type AgentRun } from '@/lib/api';
import { ArrowLeft, Settings, Users, Search, BarChart3, Plus, Cpu } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { KanbanBoardView } from '../../../components/projects/kanban-board-view';
import { CreateCardDialog } from '../../../components/projects/create-card-dialog';
import { RepoLinker } from '../../../components/projects/repo-linker';
import { CodeActivity } from '../../../components/projects/code-activity';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createCardDialogOpen, setCreateCardDialogOpen] = useState(false);
  const [projectRuns, setProjectRuns] = useState<AgentRun[]>([]);

  useEffect(() => {
    if (projectId) {
      loadProjectData();
    }
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [projectData, boardData, cardsData, runsData] = await Promise.all([
        projectsApi.getById(projectId),
        projectsApi.getBoard(projectId),
        projectsApi.getCards(projectId),
        agentsApi.getProjectRuns(projectId, { limit: '10' }).catch(() => [] as AgentRun[]),
      ]);
      
      setProject(projectData);
      setBoard(boardData);
      setCards(cardsData);
      setProjectRuns(runsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600 dark:text-gray-400">Loading project...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <Link
              href="/projects"
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Projects
            </Link>
          </div>
          
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Error loading project
                </h3>
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                  {error || 'Project not found'}
                </div>
                <div className="mt-4">
                  <button
                    onClick={loadProjectData}
                    className="text-sm bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200 px-3 py-1 rounded-md hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                href="/projects"
                className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Projects
              </Link>
              <div className="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {project.name}
                </h1>
                {project.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {project.description}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors opacity-50 cursor-not-allowed"
                disabled
                title="Coming soon"
              >
                <Search className="h-4 w-4 mr-2" />
                Search
              </button>
              <button
                className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors opacity-50 cursor-not-allowed"
                disabled
                title="Coming soon"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Analytics
              </button>
              <button
                className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors opacity-50 cursor-not-allowed"
                disabled
                title="Coming soon"
              >
                <Users className="h-4 w-4 mr-2" />
                Members
              </button>
              <button className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </button>
              <button
                className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setCreateCardDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Card
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {board ? (
          <KanbanBoardView 
            board={board} 
            cards={cards} 
            onCardUpdate={loadProjectData}
            onCardMove={loadProjectData}
          />
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 text-gray-400">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                No Kanban Board
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                This project doesn't have a kanban board set up yet.
              </p>
              <div className="mt-6">
                <button
                  type="button"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Create Kanban Board
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Agent Activity */}
      {projectRuns.length > 0 && (
        <div className="container mx-auto px-4 pb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Cpu className="h-5 w-5 text-blue-500" />
                Agent Activity
              </h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {projectRuns.length} recent run{projectRuns.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {projectRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/agents/${run.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusBadge status={run.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {run.agentName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {run.startedAt ? new Date(run.startedAt).toLocaleString() : 'Queued'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 shrink-0">
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
        </div>
      )}

      {/* Linked Repos & Code Activity */}
      <div className="container mx-auto px-4 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RepoLinker projectId={projectId} />
        <CodeActivity projectId={projectId} />
      </div>

      {/* Create Card Dialog - only show if we have a board with columns */}
      {board && board.columns && board.columns.length > 0 && (
        <CreateCardDialog
          open={createCardDialogOpen}
          onOpenChange={setCreateCardDialogOpen}
          onSuccess={loadProjectData}
          projectId={projectId}
          columnId={board.columns[0].id} // Default to first column
        />
      )}
    </div>
  );
}