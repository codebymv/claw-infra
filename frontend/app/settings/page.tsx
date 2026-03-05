'use client';

import { useEffect, useState } from 'react';
import { Copy, Trash2, Plus, Eye, EyeOff, Shield, Terminal } from 'lucide-react';
import { SectionCard } from '@/components/shared/section-card';
import { PageLoader } from '@/components/shared/loading-spinner';
import { apiKeysApi, costsApi, type ApiKeyEntry, type CostBudget } from '@/lib/api';
import { formatRelativeTime, formatDateTime, cn } from '@/lib/utils';

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [budgets, setBudgets] = useState<CostBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<{ key: string; name: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [creating, setCreating] = useState(false);

  const [budgetForm, setBudgetForm] = useState({
    agentName: '',
    dailyLimitUsd: '',
    monthlyLimitUsd: '',
    alertThresholdPercent: '80',
  });
  const [savingBudget, setSavingBudget] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [keys, bgt] = await Promise.all([
          apiKeysApi.list(),
          costsApi.getBudgets(),
        ]);
        setApiKeys(keys);
        setBudgets(bgt);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function createKey() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const result = await apiKeysApi.create(newKeyName.trim(), 'agent');
      setCreatedKey({ key: result.key, name: result.name });
      setNewKeyName('');
      const keys = await apiKeysApi.list();
      setApiKeys(keys);
    } catch {
      /* ignore */
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    await apiKeysApi.revoke(id);
    setApiKeys((prev) => prev.map((k) => k.id === id ? { ...k, isActive: false } : k));
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
    } catch {
      /* ignore */
    } finally {
      setSavingBudget(false);
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
          <div className="mb-5 rounded-lg bg-primary/8 border border-primary/20 p-5">
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
                onClick={() => navigator.clipboard.writeText(createdKey.key)}
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
                  'flex items-center justify-between rounded-lg border p-4 transition-all',
                  key.isActive
                    ? 'border-border bg-muted/20 hover:bg-muted/30'
                    : 'border-border/50 bg-muted/10 opacity-50',
                )}
              >
                <div>
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
                  <button
                    onClick={() => revokeKey(key.id)}
                    className="p-2 text-muted-foreground hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
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
