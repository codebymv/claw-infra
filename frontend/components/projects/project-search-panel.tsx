'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Filter, Clock, Tag, AlertCircle } from 'lucide-react';
import { projectsApi, type SearchResponse, type SearchResult, type Card } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ProjectSearchPanelProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onCardClick?: (cardId: string) => void;
}

export function ProjectSearchPanel({ projectId, open, onClose, onCardClick }: ProjectSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult<Card>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [executionTime, setExecutionTime] = useState(0);
  const [facets, setFacets] = useState<SearchResponse['facets'] | null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
      setFacets(null);
      setActiveFilters({});
    }
  }, [open]);

  const doSearch = useCallback(async (q: string, filters: Record<string, string>) => {
    if (!q.trim() && Object.keys(filters).length === 0) {
      setResults([]);
      setTotal(0);
      setFacets(null);
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, string> = { ...filters };
      if (q.trim()) params.q = q.trim();
      params.limit = '20';
      const res = await projectsApi.searchCards(projectId, params);
      setResults(res.results);
      setTotal(res.total);
      setExecutionTime(res.executionTime);
      setFacets(res.facets);
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value, activeFilters), 300);
  };

  const toggleFilter = (key: string, value: string) => {
    setActiveFilters(prev => {
      const next = { ...prev };
      if (next[key] === value) {
        delete next[key];
      } else {
        next[key] = value;
      }
      doSearch(query, next);
      return next;
    });
  };

  if (!open) return null;

  const priorityColors: Record<string, string> = {
    urgent: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[70vh] flex flex-col">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleInputChange(e.target.value)}
            placeholder="Search cards by title, description, tags..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowFilters(f => !f)}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                showFilters ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Filter className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Facet Filters */}
        {showFilters && facets && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
            {facets.priorities && Object.entries(facets.priorities).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Priority</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(facets.priorities).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => toggleFilter('priority', k)}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full border transition-colors',
                        activeFilters.priority === k
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      )}
                    >
                      {k} ({v})
                    </button>
                  ))}
                </div>
              </div>
            )}
            {facets.statuses && Object.entries(facets.statuses).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(facets.statuses).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => toggleFilter('status', k)}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full border transition-colors',
                        activeFilters.status === k
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      )}
                    >
                      {k.replace('_', ' ')} ({v})
                    </button>
                  ))}
                </div>
              </div>
            )}
            {facets.types && Object.entries(facets.types).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Type</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(facets.types).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => toggleFilter('type', k)}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full border transition-colors',
                        activeFilters.type === k
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      )}
                    >
                      {k} ({v})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {results.map((result, i) => {
                const card = result.item;
                return (
                  <button
                    key={card.id || i}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    onClick={() => onCardClick?.(card.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {card.title}
                        </p>
                        {card.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{card.description}</p>
                        )}
                        {result.highlights.length > 0 && (
                          <p className="text-xs text-primary mt-0.5 line-clamp-1">
                            ...{result.highlights[0]}...
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {card.priority && (
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', priorityColors[card.priority] || 'bg-gray-100 text-gray-600')}>
                            {card.priority}
                          </span>
                        )}
                        {card.type && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {card.type}
                          </span>
                        )}
                      </div>
                    </div>
                    {card.tags && card.tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {card.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 flex items-center gap-0.5">
                            <Tag className="h-2.5 w-2.5" />{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : query.trim() ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No results for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Start typing to search cards</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{total} result{total !== 1 ? 's' : ''}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {executionTime}ms
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
