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
} from 'lucide-react';
import { IntegrationAccount, MemoryRecord } from '../types/nexus';
import { googleSignIn, logoutGoogle, auth, getAccessToken } from '../lib/googleAuth';
import { User, onAuthStateChanged } from 'firebase/auth';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
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
      }
      if (memRes.ok) {
        const d = await memRes.json();
        setMemories(d.memories || []);
      }
      if (modeRes.ok) {
        const d = await modeRes.json();
        setExecutionMode(d.mode || 'simulation');
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
        // Auto-switch to production if desired
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-[#0d0e13] border border-white/[0.08] rounded-2xl flex flex-col max-h-[88vh] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide">
                NEXUS Preferences & Workspace Authorization
              </h2>
              <p className="text-[11px] text-slate-400">Google Drive, Gmail, Calendar & Autonomous Runtime</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
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

            {authError && (
              <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]">
                {authError}
              </div>
            )}
            {authSuccess && (
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px]">
                {authSuccess}
              </div>
            )}
          </div>

          {/* Execution Mode Selector */}
          <div>
            <div className="flex items-center gap-2 text-slate-200 font-semibold mb-1">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Execution Engine Mode</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-2.5">
              Choose between high-fidelity simulation sandbox or real live Google Workspace APIs.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => switchMode('simulation')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  executionMode === 'simulation'
                    ? 'bg-cyan-500/10 border-cyan-500/50 text-white shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                    : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:bg-white/[0.04]'
                }`}
              >
                <div className="font-semibold text-xs text-white mb-0.5">Simulation Sandbox</div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  Preloaded sample invoices, contracts, and test calendar slots. Safe for dry runs.
                </div>
              </button>

              <button
                onClick={() => switchMode('production')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  executionMode === 'production'
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                    : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:bg-white/[0.04]'
                }`}
              >
                <div className="font-semibold text-xs text-white mb-0.5">Live Production</div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  Direct REST execution on your live Google Drive, Gmail, and Google Calendar.
                </div>
              </button>
            </div>
          </div>

          {/* Connectors & Integrations List */}
          <div>
            <div className="flex items-center gap-2 text-slate-200 font-semibold mb-2">
              <Database className="w-4 h-4 text-cyan-400" />
              <span>Connectors & Integration Health</span>
            </div>

            <div className="space-y-2">
              {integrations.map(intg => (
                <div
                  key={intg.service}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-slate-200">{intg.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {authUser && (intg.service === 'google_drive' || intg.service === 'gmail' || intg.service === 'google_calendar')
                        ? authUser.email
                        : intg.accountEmail}
                    </div>
                  </div>

                  <button
                    onClick={() => toggleIntegration(intg.service, intg.connected)}
                    className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                      intg.connected
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-white/[0.04] text-slate-400 border border-white/[0.08] hover:bg-white/[0.08]'
                    }`}
                  >
                    {intg.connected ? 'Active' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Persistent Memory Store */}
          <div>
            <div className="flex items-center gap-2 text-slate-200 font-semibold mb-2">
              <Brain className="w-4 h-4 text-cyan-400" />
              <span>Persistent Long-Term Memory</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Rules, user preferences, and business context preserved across sessions.
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
