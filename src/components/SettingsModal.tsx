import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Database,
  Brain,
  Sparkles,
  CheckCircle,
  AlertCircle,
  LogIn,
  LogOut,
  FolderSync,
  Mail,
  Calendar,
  Layers,
  Key,
} from 'lucide-react';
import { IntegrationAccount, MemoryRecord } from '../types/nexus';
import { googleSignIn, logoutGoogle, auth } from '../lib/googleAuth';
import { User, onAuthStateChanged } from 'firebase/auth';
import { SecurityCenter } from './SecurityCenter';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLockNexus?: () => void;
  initialTab?: 'workspace' | 'security' | 'integrations' | 'memory';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onLockNexus,
  initialTab = 'workspace',
}) => {
  const [activeTab, setActiveTab] = useState<'workspace' | 'security' | 'integrations' | 'memory'>(
    initialTab
  );
  const [integrations, setIntegrations] = useState<IntegrationAccount[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(auth.currentUser);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<'simulation' | 'production'>('simulation');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setAuthUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [intgRes, memRes, modeRes] = await Promise.all([
        fetch('/api/integrations'),
        fetch('/api/memory'),
        fetch('/api/mode'),
      ]);
      if (intgRes.ok) {
        const d = await intgRes.json();
        setIntegrations(d.integrations || []);
        if (d.mode) setExecutionMode(d.mode);
      }
      if (memRes.ok) {
        const d = await memRes.json();
        setMemories(d.memories || []);
      }
      if (modeRes.ok) {
        const d = await modeRes.json();
        setExecutionMode(d.mode);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setAuthError(null);
      setAuthSuccess(null);
      const res = await googleSignIn();
      if (res?.user) {
        setAuthUser(res.user);
        setAuthSuccess(`Signed in as ${res.user.email} with Google Workspace access.`);
        await switchMode('production');
        await loadSettings();
      }
    } catch (err: any) {
      console.error('Google Sign In error:', err);
      setAuthError(err.message || 'Failed to authenticate with Google.');
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await logoutGoogle();
      setAuthUser(null);
      setAuthSuccess('Signed out of Google Workspace.');
      await switchMode('simulation');
    } catch (err: any) {
      console.error(err);
    }
  };

  const switchMode = async (mode: 'simulation' | 'production') => {
    try {
      const res = await fetch('/api/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (res.ok) {
        const d = await res.json();
        setExecutionMode(d.mode);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleIntegration = async (service: string, currentStatus: boolean) => {
    try {
      const res = await fetch('/api/integrations/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, connected: !currentStatus }),
      });
      if (res.ok) {
        const d = await res.json();
        setIntegrations(d.integrations);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const addMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;

    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey.trim(), value: newValue.trim(), category: 'preference' }),
      });
      if (res.ok) {
        setNewKey('');
        setNewValue('');
        loadSettings();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-[#0d0e13] border border-white/[0.08] rounded-2xl flex flex-col max-h-[90vh] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide">
                NEXUS Control Panel & Security
              </h2>
              <p className="text-[11px] text-slate-400">Security Gateway, Workspace Integrations & Preferences</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-white/[0.06] text-xs">
          <button
            onClick={() => setActiveTab('security')}
            className={`pb-2.5 px-2 font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'security'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Security Gateway</span>
          </button>
          <button
            onClick={() => setActiveTab('workspace')}
            className={`pb-2.5 px-2 font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'workspace'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderSync className="w-3.5 h-3.5" />
            <span>Workspace Auth</span>
          </button>
          <button
            onClick={() => setActiveTab('integrations')}
            className={`pb-2.5 px-2 font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'integrations'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Execution Modes</span>
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`pb-2.5 px-2 font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'memory'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>Memory</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 text-xs space-y-6">
          {activeTab === 'security' && (
            <SecurityCenter
              onLockNexus={() => {
                onClose();
                onLockNexus?.();
              }}
              onRefreshAuth={loadSettings}
            />
          )}

          {activeTab === 'workspace' && (
            <div className="space-y-4">
              {/* Google Workspace Account Card */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-cyan-500/20 relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300">
                      <FolderSync className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-xs">Google Workspace Account</h3>
                      <p className="text-[11px] text-slate-400">OAuth Scopes: Drive, Gmail & Calendar</p>
                    </div>
                  </div>

                  {authUser ? (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-medium">
                      <CheckCircle className="w-3 h-3" />
                      <span>Authenticated</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-medium">
                      <AlertCircle className="w-3 h-3" />
                      <span>Not Connected</span>
                    </div>
                  )}
                </div>

                {authUser ? (
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-between">
                      <div className="truncate">
                        <div className="text-white font-medium text-xs">{authUser.displayName || 'Google Account'}</div>
                        <div className="text-slate-400 text-[11px]">{authUser.email}</div>
                      </div>
                      <button
                        onClick={handleGoogleSignOut}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/[0.06] hover:bg-red-500/20 hover:text-red-300 text-slate-300 text-[11px] transition-colors"
                      >
                        <LogOut className="w-3 h-3" />
                        <span>Disconnect</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
                      <span className="flex items-center gap-1">
                        <FolderSync className="w-3.5 h-3.5 text-cyan-400" /> Drive (files/read)
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-cyan-400" /> Gmail (read/send)
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-cyan-400" /> Calendar (events/read)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-slate-300 text-[11px] mb-3 leading-relaxed">
                      Sign in with your Google account to grant NEXUS live access to search and read Drive files, inspect calendar availability, schedule events, and compose Gmail drafts.
                    </p>
                    <button
                      id="btn-google-signin"
                      onClick={handleGoogleSignIn}
                      className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-white text-slate-900 font-semibold text-xs hover:bg-slate-100 active:bg-slate-200 transition-all shadow-md"
                    >
                      <LogIn className="w-4 h-4 text-cyan-600" />
                      <span>Sign in with Google Workspace</span>
                    </button>
                  </div>
                )}

                {authSuccess && (
                  <div className="mt-3 p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{authSuccess}</span>
                  </div>
                )}
                {authError && (
                  <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{authError}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-4">
              {/* Execution Mode Selector */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-white">Execution Mode</span>
                  <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-lg border border-white/[0.08]">
                    <button
                      onClick={() => switchMode('simulation')}
                      className={`px-3 py-1 rounded text-xs transition-all ${
                        executionMode === 'simulation'
                          ? 'bg-cyan-500 text-black font-semibold shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Sandbox Mode
                    </button>
                    <button
                      onClick={() => switchMode('production')}
                      className={`px-3 py-1 rounded text-xs transition-all ${
                        executionMode === 'production'
                          ? 'bg-emerald-500 text-black font-semibold shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Live Workspace Mode
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Sandbox runs deterministic local simulations for safe dry-runs. Live Workspace executes real verified operations via Google Drive, Gmail, and Google Calendar APIs.
                </p>
              </div>

              {/* Connected Services */}
              <div className="space-y-2">
                {integrations.map(intg => (
                  <div
                    key={intg.service}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <div>
                        <div className="font-medium text-white text-xs">{intg.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Mode: {intg.mode} • Scopes: {intg.scopes.length}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleIntegration(intg.service, intg.connected)}
                      className="px-2.5 py-1 rounded text-[10px] font-mono bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                    >
                      {intg.connected ? 'Active' : 'Standby'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-200 font-semibold">
                <Brain className="w-4 h-4 text-cyan-400" />
                <span>Persistent Long-Term Memory</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Rules, user preferences, and business context preserved across sessions with user isolation.
              </p>

              <div className="space-y-1.5 mb-3">
                {memories.map(m => (
                  <div
                    key={m.id}
                    className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-start justify-between"
                  >
                    <div>
                      <div className="font-mono text-cyan-300 text-[11px]">{m.key}</div>
                      <div className="text-slate-300 mt-0.5">{m.value}</div>
                    </div>
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-500 font-mono">
                      {m.category}
                    </span>
                  </div>
                ))}
              </div>

              {/* Add memory form */}
              <form onSubmit={addMemory} className="flex gap-2">
                <input
                  type="text"
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                  placeholder="Key (e.g. default_currency)"
                  className="flex-1 py-1.5 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/40"
                />
                <input
                  type="text"
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  placeholder="Value (e.g. MYR)"
                  className="flex-1 py-1.5 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/40"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-colors"
                >
                  Save
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] bg-white/[0.01] flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>NEXUS Security Enclave Active</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
