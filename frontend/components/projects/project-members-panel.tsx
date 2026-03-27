'use client';

import { useState } from 'react';
import { X, Users, UserPlus, Shield, Crown, Eye, Trash2, Check } from 'lucide-react';
import { projectsApi, type ProjectMember } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ProjectMembersPanelProps {
  projectId: string;
  members: ProjectMember[];
  open: boolean;
  onClose: () => void;
  onMembersChange: () => void;
}

const roleConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  owner: { label: 'Owner', icon: <Crown className="h-3 w-3" />, color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  admin: { label: 'Admin', icon: <Shield className="h-3 w-3" />, color: 'text-primary bg-primary/10' },
  member: { label: 'Member', icon: <Users className="h-3 w-3" />, color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  viewer: { label: 'Viewer', icon: <Eye className="h-3 w-3" />, color: 'text-muted-foreground bg-muted' },
};

export function ProjectMembersPanel({ projectId, members, open, onClose, onMembersChange }: ProjectMembersPanelProps) {
  const [addForm, setAddForm] = useState({ userId: '', role: 'member' });
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = async () => {
    if (!addForm.userId.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await projectsApi.addMember(projectId, addForm.userId.trim(), addForm.role);
      setAddForm({ userId: '', role: 'member' });
      setShowAddForm(false);
      onMembersChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setRemoveLoading(true);
    try {
      await projectsApi.removeMember(projectId, userId);
      setRemovingId(null);
      onMembersChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemoveLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Members</h2>
              <p className="text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(f => !f)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Add Member Form */}
        {showAddForm && (
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="User ID"
                value={addForm.userId}
                onChange={e => setAddForm(p => ({ ...p, userId: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
              />
              <select
                value={addForm.role}
                onChange={e => setAddForm(p => ({ ...p, role: e.target.value }))}
                className="h-9 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                onClick={handleAdd}
                disabled={adding || !addForm.userId.trim()}
                className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-40 transition-all"
              >
                {adding ? '...' : 'Add'}
              </button>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        {/* Member List */}
        <div className="flex-1 overflow-y-auto">
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No members yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {members.map(member => {
                const rc = roleConfig[member.role] || roleConfig.member;
                return (
                  <div key={member.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">
                        {(member.user?.displayName || member.user?.email || member.userId).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {member.user?.displayName || member.user?.email || member.userId}
                        </p>
                        {member.user?.email && member.user?.displayName && (
                          <p className="text-[11px] text-muted-foreground truncate">{member.user.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full', rc.color)}>
                        {rc.icon}
                        {rc.label}
                      </span>
                      {member.role !== 'owner' && (
                        removingId === member.userId ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleRemove(member.userId)}
                              disabled={removeLoading}
                              className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setRemovingId(null)}
                              disabled={removeLoading}
                              className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRemovingId(member.userId)}
                            className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Remove member"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
