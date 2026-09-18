import React, { useState, useEffect } from 'react';
import { X, Shield, Database, Brain, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';
import { IntegrationAccount, MemoryRecord } from '../types/nexus';

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

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [intgRes, memRes] = await Promise.all([
        fetch('/api/integrations'),
        fetch('/api/memory'),
      ]);
      if (intgRes.ok) {
        const d = await intgRes.json();
        setIntegrations(d.integrations || []);
      }
      if (memRes.ok) {
        const d = await memRes.json();
        setMemories(d.memories || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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
      <div className="w-full max-w-lg bg-[#0d0e13] border border-white/[0.08] rounded-2xl flex flex-col max-h-[88vh] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide">
                NEXUS Preferences & Integrations
              </h2>
              <p className="text-[11px] text-slate-400">BLACKTOWER™ Master Layer Configuration</p>
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
          {/* Workspace Integrations */}
          <div>
            <div className="flex items-center gap-2 text-slate-200 font-semibold mb-2">
              <Database className="w-4 h-4 text-cyan-400" />
              <span>Google Workspace & Cloud Connectors</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              NEXUS routes actions to these verified services. Toggle to simulate connection state or test failure recovery.
            </p>

            <div className="space-y-2">
              {integrations.map(intg => (
                <div
                  key={intg.service}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-slate-200">{intg.name}</div>
                    <div className="text-[10px] text-slate-400">{intg.accountEmail}</div>
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
              Context, user preferences, and business rules preserved across sessions.
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
