'use client';

import { useEffect, useState } from 'react';
import { Copy, Trash2, Plus, Eye, EyeOff, Shield } from 'lucide-react';
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
    <div className="max-w-3xl space-y-6">
      {/* API Keys */}
      <SectionCard
        title="Agent API Keys"
        description="Keys used by ZeroClaw agents to report metrics, logs, and status"
        action={
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            Secured with bcrypt
          </span>
        }
      >
        {createdKey && (
          <div className="mb-4 rounded-md bg-green-400/10 border border-green-400/20 p-4">
            <p className="text-sm font-semibold text-green-400 mb-2">
              New key created for <strong>{createdKey.name}</strong> — copy it now, it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-card p-2 text-xs font-mono overflow-x-auto">
                {showKey ? createdKey.key : '•'.repeat(40)}
              </code>
              <button onClick={() => setShowKey((p) => !p)} className="p-2 hover:bg-accent rounded">
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(createdKey.key)}
                className="p-2 hover:bg-accent rounded"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Key name (e.g. production-agent)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createKey()}
            className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={createKey}
            disabled={creating || !newKeyName.trim()}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>

        <div className="space-y-2">
          {apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet</p>
          ) : (
            apiKeys.map((key) => (
              <div
                key={key.id}
                className={cn(
                  'flex items-center justify-between rounded-md border p-3',
                  key.isActive ? 'border-border bg-card' : 'border-border/30 bg-muted/20 opacity-50',
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{key.name}</span>
                    {!key.isActive && (
                      <span className="text-xs text-muted-foreground">revoked</span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground font-mono">{key.keyPrefix}…</span>
                    <span className="text-xs text-muted-foreground capitalize">{key.type}</span>
                    {key.lastUsedAt && (
                      <span className="text-xs text-muted-foreground">
                        Last used {formatRelativeTime(key.lastUsedAt)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Created {formatDateTime(key.createdAt)}
                    </span>
                  </div>
                </div>
                {key.isActive && (
                  <button
                    onClick={() => revokeKey(key.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </SectionCard>

      {/* Budget Configuration */}
      <SectionCard
        title="Budget Configuration"
        description="Set spending limits and alert thresholds"
      >
        <div className="space-y-4">
          {budgets.length > 0 && (
            <div className="space-y-2 mb-4">
              {budgets.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded border border-border bg-muted/20 p-3 text-sm">
                  <span className="font-medium">{b.agentName || 'Global'}</span>
                  <div className="flex gap-4 text-muted-foreground text-xs">
                    {b.dailyLimitUsd && <span>Daily: ${b.dailyLimitUsd}</span>}
                    {b.monthlyLimitUsd && <span>Monthly: ${b.monthlyLimitUsd}</span>}
                    <span>Alert at {b.alertThresholdPercent}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Agent Name (blank = global)
              </label>
              <input
                type="text"
                placeholder="e.g. my-agent (or blank for global)"
                value={budgetForm.agentName}
                onChange={(e) => setBudgetForm((p) => ({ ...p, agentName: e.target.value }))}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Alert Threshold (%)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={budgetForm.alertThresholdPercent}
                onChange={(e) => setBudgetForm((p) => ({ ...p, alertThresholdPercent: e.target.value }))}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Daily Limit (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 5.00"
                value={budgetForm.dailyLimitUsd}
                onChange={(e) => setBudgetForm((p) => ({ ...p, dailyLimitUsd: e.target.value }))}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Monthly Limit (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 50.00"
                value={budgetForm.monthlyLimitUsd}
                onChange={(e) => setBudgetForm((p) => ({ ...p, monthlyLimitUsd: e.target.value }))}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <button
            onClick={saveBudget}
            disabled={savingBudget}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {savingBudget ? 'Saving...' : 'Save Budget'}
          </button>
        </div>
      </SectionCard>

      {/* Connection Info */}
      <SectionCard title="Connection Info" description="Configure your agents to report to these endpoints">
        <div className="space-y-2 font-mono text-xs">
          <div className="rounded bg-muted/30 border border-border p-3">
            <p className="text-muted-foreground mb-1">Agent Ingest Base URL</p>
            <p>{process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/ingest</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded bg-muted/30 border border-border p-3">
              <p className="text-muted-foreground mb-1">Create Run</p>
              <p>POST /ingest/runs</p>
            </div>
            <div className="rounded bg-muted/30 border border-border p-3">
              <p className="text-muted-foreground mb-1">Report Cost</p>
              <p>POST /ingest/costs</p>
            </div>
            <div className="rounded bg-muted/30 border border-border p-3">
              <p className="text-muted-foreground mb-1">Send Logs</p>
              <p>POST /ingest/logs/batch</p>
            </div>
            <div className="rounded bg-muted/30 border border-border p-3">
              <p className="text-muted-foreground mb-1">Report Metrics</p>
              <p>POST /ingest/metrics</p>
            </div>
          </div>
          <p className="text-muted-foreground">Header: <code className="text-foreground">X-Agent-Token: &lt;your-api-key&gt;</code></p>
        </div>
      </SectionCard>
    </div>
  );
}
