'use client';

import { useEffect, useState } from 'react';
import { Copy, Trash2, Plus, Eye, EyeOff, Shield, Terminal, Check, X, Github, ToggleLeft, ToggleRight, ExternalLink, RefreshCw } from 'lucide-react';
import { SectionCard } from '@/components/shared/section-card';
import { PageLoader } from '@/components/shared/loading-spinner';
import { apiKeysApi, costsApi, githubApi, type ApiKeyEntry, type CostBudget, type GitHubInstallation, type GithubAccessibleRepo, type GitHubRepoGrantEntry } from '@/lib/api';
import { formatRelativeTime, formatDateTime, cn } from '@/lib/utils';
import { useAppToast } from '@/components/layout/app-shell';
import { useDynamicTitle } from '@/hooks/useDynamicTitle';

export default function SettingsPage() {
  useDynamicTitle('Settings | ClawInfra');

  const toast = useAppToast();
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [budgets, setBudgets] = useState<CostBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<{ key: string; name: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [creating, setCreating] = useState(false);

  // Inline revoke confirmation state — holds the id of the key pending confirmation
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  const [budgetForm, setBudgetForm] = useState({
    agentName: '',
    dailyLimitUsd: '',
    monthlyLimitUsd: '',
    alertThresholdPercent: '80',
  });
  const [savingBudget, setSavingBudget] = useState(false);

  // GitHub App state
  const [ghConfigured, setGhConfigured] = useState(false);
  const [ghInstallUrl, setGhInstallUrl] = useState<string | null>(null);
  const [ghInstallations, setGhInstallations] = useState<GitHubInstallation[]>([]);
  const [ghRepos, setGhRepos] = useState<GithubAccessibleRepo[]>([]);
  const [ghGrants, setGhGrants] = useState<GitHubRepoGrantEntry[]>([]);
  const [ghLoading, setGhLoading] = useState(false);
  const [ghReposLoading, setGhReposLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [keys, bgt] = await Promise.all([
          apiKeysApi.list(),
          costsApi.getBudgets(),
        ]);
        setApiKeys(keys);
        setBudgets(bgt);

        // Load GitHub status, installations, and grants (non-blocking)
        try {
          const status = await githubApi.getStatus();
          setGhConfigured(status.configured);
          setGhInstallUrl(status.installUrl);
          if (status.configured) {
            const [installations, grants] = await Promise.all([
              githubApi.getInstallations(),
              githubApi.getGrantedRepos(),
            ]);
            setGhInstallations(installations);
            setGhGrants(grants);
          }
        } catch {
          // GitHub endpoints may not exist yet — silently ignore
        }
      } catch (err) {
        toast.error((err as Error).message || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function createKey() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const result = await apiKeysApi.create(newKeyName.trim(), 'agent');
      setCreatedKey({ key: result.key, name: result.name });
      setNewKeyName('');
      const keys = await apiKeysApi.list();
      setApiKeys(keys);
      toast.success(`API key "${result.name}" created`);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  }

  async function confirmRevoke(id: string) {
    setRevokeLoading(true);
    try {
      await apiKeysApi.revoke(id);
      setApiKeys((prev) => prev.map((k) => k.id === id ? { ...k, isActive: false } : k));
      toast.success('API key revoked');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to revoke API key');
    } finally {
      setRevokeLoading(false);
      setRevokingId(null);
    }
  }

  async function saveBudget() {
    setSavingBudget(true);
    try {
      await costsApi.upsertBudget({
        agentName: budgetForm.agentName || null,
        dailyLimitUsd: budgetForm.dailyLimitUsd || null,
        monthlyLimitUsd: budgetForm.monthlyLimitUsd || null,
        alertThresholdPercent: parseInt(budgetForm.alertThresholdPercent),
      });
      const bgt = await costsApi.getBudgets();
      setBudgets(bgt);
      setBudgetForm({ agentName: '', dailyLimitUsd: '', monthlyLimitUsd: '', alertThresholdPercent: '80' });
      toast.success('Budget saved');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save budget');
    } finally {
      setSavingBudget(false);
    }
  }

  async function loadGhRepos() {
    setGhReposLoading(true);
    try {
      const repos = await githubApi.getRepos();
      setGhRepos(repos);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to load repos');
    } finally {
      setGhReposLoading(false);
    }
  }

  async function toggleRepo(repo: GithubAccessibleRepo) {
    const existing = ghGrants.find((g) => g.repoFullName === repo.full_name && g.isActive);
    if (existing) {
      try {
        await githubApi.revokeGrant(existing.id);
        setGhGrants((prev) => prev.filter((g) => g.id !== existing.id));
        toast.success(`Removed ${repo.full_name}`);
      } catch (err) {
        toast.error((err as Error).message || 'Failed to revoke grant');
      }
    } else if (ghInstallations.length > 0) {
      try {
        const grant = await githubApi.grantRepo(ghInstallations[0].id, repo.full_name);
        setGhGrants((prev) => [...prev, grant]);
        toast.success(`Added ${repo.full_name}`);
      } catch (err) {
        toast.error((err as Error).message || 'Failed to grant repo');
      }
    }
  }

  async function disconnectGh(installationId: string) {
    setGhLoading(true);
    try {
      await githubApi.disconnect(installationId);
      setGhInstallations((prev) => prev.filter((i) => i.id !== installationId));
      setGhGrants([]);
      setGhRepos([]);
      toast.success('GitHub disconnected');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to disconnect');
    } finally {
      setGhLoading(false);
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <SectionCard
        title="Agent API Keys"
        description="Keys used by ClawInfra agents to report metrics, logs, and status"
        action={
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Secured with bcrypt</span>
          </span>
        }
      >
        {createdKey && (
          <div className="mb-5 rounded-lg bg-primary/10 border border-primary/20 p-5">
            <p className="text-[13px] font-semibold text-primary mb-3">
              New key created for <strong>{createdKey.name}</strong> — copy it now, it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-muted border border-border p-2.5 text-[11px] font-mono overflow-x-auto">
                {showKey ? createdKey.key : '•'.repeat(40)}
              </code>
              <button
                onClick={() => setShowKey((p) => !p)}
                className="p-2 hover:bg-accent rounded-lg transition-colors"
              >
                {showKey ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdKey.key);
                  toast.success('API key copied to clipboard');
                }}
                className="p-2 hover:bg-accent rounded-lg transition-colors"
              >
                <Copy className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="mt-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex gap-2 mb-5">
          <input
            type="text"
            placeholder="Key name (e.g. production-agent)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createKey()}
            className="flex-1 h-10 rounded-lg border border-border bg-background px-4 text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
          />
          <button
            onClick={createKey}
            disabled={creating || !newKeyName.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all"
          >
            <Plus className="h-4 w-4" />
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>

        <div className="space-y-2">
          {apiKeys.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-2">No API keys yet</p>
          ) : (
            apiKeys.map((key) => (
              <div
                key={key.id}
                className={cn(
                  'rounded-lg border p-4 transition-all',
                  key.isActive
                    ? 'border-border bg-muted/20 hover:bg-muted/30'
                    : 'border-border/50 bg-muted/10 opacity-50',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{key.name}</span>
                      {!key.isActive && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-500 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
                          revoked
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-[11px] text-muted-foreground font-mono">{key.keyPrefix}…</span>
                      <span className="text-[11px] text-muted-foreground capitalize">{key.type}</span>
                      {key.lastUsedAt && (
                        <span className="text-[11px] text-muted-foreground">
                          Used {formatRelativeTime(key.lastUsedAt)}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground hidden sm:inline">
                        Created {formatDateTime(key.createdAt)}
                      </span>
                    </div>
                  </div>

                  {key.isActive && (
                    revokingId === key.id ? (
                      /* Inline confirmation row */
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">Revoke?</span>
                        <button
                          onClick={() => confirmRevoke(key.id)}
                          disabled={revokeLoading}
                          className="flex items-center gap-1 rounded-lg bg-rose-500/15 border border-rose-500/30 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 disabled:opacity-50 transition-all"
                        >
                          <Check className="h-3 w-3" />
                          Confirm
                        </button>
                        <button
                          onClick={() => setRevokingId(null)}
                          disabled={revokeLoading}
                          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 transition-all"
                        >
                          <X className="h-3 w-3" />
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRevokingId(key.id)}
                        className="p-2 text-muted-foreground hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all shrink-0"
                        title="Revoke key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Budget Configuration"
        description="Set spending limits and alert thresholds"
      >
        <div className="space-y-5">
          {budgets.length > 0 && (
            <div className="space-y-2 mb-2">
              {budgets.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col gap-1 rounded-lg border border-border bg-muted/20 p-4 text-[13px] sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium">{b.agentName || 'Global'}</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground text-[11px] font-mono">
                    {b.dailyLimitUsd && <span>Daily: ${b.dailyLimitUsd}</span>}
                    {b.monthlyLimitUsd && <span>Monthly: ${b.monthlyLimitUsd}</span>}
                    <span>Alert at {b.alertThresholdPercent}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">
                Agent Name (blank = global)
              </label>
              <input
                type="text"
                placeholder="e.g. my-agent (or blank for global)"
                value={budgetForm.agentName}
                onChange={(e) => setBudgetForm((p) => ({ ...p, agentName: e.target.value }))}
                className="w-full h-10 rounded-lg border border-border bg-background px-4 text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">
                Alert Threshold (%)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={budgetForm.alertThresholdPercent}
                onChange={(e) => setBudgetForm((p) => ({ ...p, alertThresholdPercent: e.target.value }))}
                className="w-full h-10 rounded-lg border border-border bg-background px-4 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">
                Daily Limit (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 5.00"
                value={budgetForm.dailyLimitUsd}
                onChange={(e) => setBudgetForm((p) => ({ ...p, dailyLimitUsd: e.target.value }))}
                className="w-full h-10 rounded-lg border border-border bg-background px-4 text-[13px] font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">
                Monthly Limit (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 50.00"
                value={budgetForm.monthlyLimitUsd}
                onChange={(e) => setBudgetForm((p) => ({ ...p, monthlyLimitUsd: e.target.value }))}
                className="w-full h-10 rounded-lg border border-border bg-background px-4 text-[13px] font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
              />
            </div>
          </div>

          <button
            onClick={saveBudget}
            disabled={savingBudget}
            className="rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all"
          >
            {savingBudget ? 'Saving...' : 'Save Budget'}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="GitHub Integration"
        description="Connect a GitHub App to sync repos without a personal access token"
        action={
          <Github className="h-3.5 w-3.5 text-muted-foreground" />
        }
      >
        {ghInstallations.length > 0 ? (
          <div className="space-y-4">
            {ghInstallations.map((inst) => (
              <div key={inst.id} className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Github className="h-4 w-4 text-foreground" />
                    <span className="text-[13px] font-medium">{inst.accountLogin}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded">
                      {inst.accountType}
                    </span>
                  </div>
                  <button
                    onClick={() => disconnectGh(inst.id)}
                    disabled={ghLoading}
                    className="text-[11px] text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg px-2.5 py-1.5 transition-all disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                </div>

                {/* Granted repos */}
                {ghGrants.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Tracked Repos
                    </p>
                    {ghGrants.map((g) => (
                      <div key={g.id} className="flex items-center justify-between rounded-md bg-background/50 border border-border/50 px-3 py-2">
                        <span className="text-[12px] font-mono">{g.repoFullName}</span>
                        <button
                          onClick={async () => {
                            try {
                              await githubApi.revokeGrant(g.id);
                              setGhGrants((prev) => prev.filter((gr) => gr.id !== g.id));
                              toast.success(`Removed ${g.repoFullName}`);
                            } catch (err) {
                              toast.error((err as Error).message || 'Failed to remove');
                            }
                          }}
                          className="text-[11px] text-muted-foreground hover:text-rose-500 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add repos */}
                <div className="mt-3">
                  {ghRepos.length === 0 ? (
                    <button
                      onClick={loadGhRepos}
                      disabled={ghReposLoading}
                      className="flex items-center gap-1.5 text-[12px] text-primary hover:text-primary/80 transition-colors"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', ghReposLoading && 'animate-spin')} />
                      {ghReposLoading ? 'Loading repos...' : 'Browse repos to add'}
                    </button>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Available Repos
                      </p>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {ghRepos.map((repo) => {
                          const isGranted = ghGrants.some((g) => g.repoFullName === repo.full_name && g.isActive);
                          return (
                            <button
                              key={repo.full_name}
                              onClick={() => toggleRepo(repo)}
                              className="flex items-center justify-between w-full rounded-md bg-background/50 border border-border/50 px-3 py-2 hover:bg-muted/30 transition-all text-left"
                            >
                              <span className="text-[12px] font-mono truncate">{repo.full_name}</span>
                              {isGranted ? (
                                <ToggleRight className="h-4 w-4 text-primary shrink-0" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : ghConfigured && ghInstallUrl ? (
          <div className="text-center py-4">
            <p className="text-[13px] text-muted-foreground mb-3">
              No GitHub App installation connected yet.
            </p>
            <a
              href={ghInstallUrl}
              className="inline-flex items-center gap-2 rounded-lg bg-[#24292f] dark:bg-[#f0f0f0] px-5 py-2.5 text-[13px] font-semibold text-white dark:text-[#24292f] hover:opacity-90 transition-all"
            >
              <Github className="h-4 w-4" />
              Install GitHub App
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground py-2">
            GitHub App integration is not configured. Set <code className="text-foreground bg-muted px-1.5 py-0.5 rounded">GITHUB_APP_ID</code> and <code className="text-foreground bg-muted px-1.5 py-0.5 rounded">GITHUB_APP_PRIVATE_KEY</code> env vars to enable.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Connection Info"
        description="Configure your agents to report to these endpoints"
        action={
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
        }
      >
        <div className="space-y-3 font-mono text-[11px]">
          <div className="rounded-lg bg-muted/30 border border-border p-4">
            <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold mb-1.5">
              Agent Ingest Base URL
            </p>
            <p>
              {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/ingest
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <EndpointTile label="Create Run" method="POST" path="/ingest/runs" />
            <EndpointTile label="Report Cost" method="POST" path="/ingest/costs" />
            <EndpointTile label="Send Logs" method="POST" path="/ingest/logs/batch" />
            <EndpointTile label="Report Metrics" method="POST" path="/ingest/metrics" />
          </div>
          <p className="text-muted-foreground pt-1">
            Header: <code className="text-foreground bg-muted px-1.5 py-0.5 rounded">X-Agent-Token: &lt;your-api-key&gt;</code>
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

function EndpointTile({ label, method, path }: { label: string; method: string; path: string }) {
  return (
    <div className="rounded-lg bg-muted/30 border border-border p-3.5">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold mb-1">
        {label}
      </p>
      <p>
        <span className="text-primary font-bold">{method}</span>
        <span className="ml-1.5">{path}</span>
      </p>
    </div>
  );
}
