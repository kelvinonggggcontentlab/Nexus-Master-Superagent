import React, { useState, useEffect } from 'react';
import { X, Activity, Database, CheckCircle, AlertTriangle, Clock, RefreshCw, Layers } from 'lucide-react';
import { ObservabilitySummary, ToolCallLog } from '../types/nexus';

interface ObservabilityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ObservabilityDrawer: React.FC<ObservabilityDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const [data, setData] = useState<ObservabilitySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'integrations' | 'graph'>('logs');

  const fetchObservability = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/observability');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchObservability();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#0b0c10] border-l border-white/[0.08] flex flex-col h-full shadow-2xl">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide">
                NEXUS Observability & Telemetry
              </h2>
              <p className="text-[11px] text-slate-400">BLACKTOWER™ Runtime Execution Graph & Audit</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchObservability}
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Top Metrics Row */}
        <div className="grid grid-cols-3 gap-2 p-4 border-b border-white/[0.04] bg-white/[0.01]">
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <div className="text-[10px] text-slate-500 font-medium">TOTAL RUNS</div>
            <div className="text-lg font-bold font-orbitron text-white mt-0.5">
              {data?.totalRuns ?? 0}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <div className="text-[10px] text-emerald-400/80 font-medium">VERIFIED SUCCESS</div>
            <div className="text-lg font-bold font-orbitron text-emerald-400 mt-0.5">
              {data?.successfulRuns ?? 0}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <div className="text-[10px] text-cyan-400/80 font-medium">TOOL DISPATCHES</div>
            <div className="text-lg font-bold font-orbitron text-cyan-400 mt-0.5">
              {data?.toolCallsCount ?? 0}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-4 border-b border-white/[0.04] text-xs">
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-2.5 px-3 font-medium border-b-2 transition-all ${
              activeTab === 'logs'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Audit Log ({data?.recentLogs?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('integrations')}
            className={`py-2.5 px-3 font-medium border-b-2 transition-all ${
              activeTab === 'integrations'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Connected Adapters
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={`py-2.5 px-3 font-medium border-b-2 transition-all ${
              activeTab === 'graph'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Runtime Pipeline
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab === 'logs' && (
            <div className="space-y-2">
              {(!data?.recentLogs || data.recentLogs.length === 0) ? (
                <div className="text-center py-12 text-xs text-slate-500">
                  No execution logs recorded yet. Run a command from the home screen.
                </div>
              ) : (
                data.recentLogs.map((log: ToolCallLog) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {log.status === 'success' ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                        )}
                        <span className="font-mono font-semibold text-slate-200">{log.tool}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase ${
                            log.actionType === 'destructive'
                              ? 'bg-rose-500/20 text-rose-300'
                              : log.actionType === 'write'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-cyan-500/10 text-cyan-300'
                          }`}
                        >
                          {log.actionType}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <Clock className="w-3 h-3" />
                        <span>{log.durationMs}ms</span>
                      </div>
                    </div>

                    <div className="p-2 rounded bg-black/40 border border-white/[0.03] text-[11px] font-mono text-slate-400 overflow-x-auto">
                      <div className="text-slate-500 text-[10px]">PARAMS:</div>
                      {JSON.stringify(log.parameters, null, 2)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-2.5">
              {data?.integrations?.map(intg => (
                <div
                  key={intg.service}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-slate-300">
                      <Database className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{intg.name}</div>
                      <div className="text-[10px] text-slate-400">{intg.accountEmail}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-slate-400 bg-white/[0.03] border border-white/[0.04]">
                      {intg.mode === 'production' ? 'Live' : 'Sandbox'}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        intg.connected
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                          : 'bg-slate-500/10 border border-slate-500/30 text-slate-400'
                      }`}
                    >
                      {intg.connected ? 'Active' : 'Unlinked'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'graph' && (
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 text-xs">
              <div className="flex items-center gap-2 text-cyan-400 font-medium">
                <Layers className="w-4 h-4" />
                <span>NEXUS Autonomous Task Lifecycle</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Every user request traverses this deterministic execution lifecycle:
              </p>
              <div className="space-y-1.5 font-mono text-[11px] text-slate-300">
                <div className="p-2 rounded bg-black/40 border border-white/[0.04]">
                  1. Intent Understanding (User Goal Extractor)
                </div>
                <div className="p-2 rounded bg-black/40 border border-white/[0.04]">
                  2. Task Graph Planning & Dependency Ordering
                </div>
                <div className="p-2 rounded bg-black/40 border border-white/[0.04]">
                  3. Permission & Action Boundary Classification
                </div>
                <div className="p-2 rounded bg-black/40 border border-white/[0.04]">
                  4. Tool Routing & Idempotent Write Guard
                </div>
                <div className="p-2 rounded bg-black/40 border border-white/[0.04]">
                  5. Observation & Dynamic Replanning
                </div>
                <div className="p-2 rounded bg-black/40 border border-white/[0.04]">
                  6. Mandatory Output Verification Engine
                </div>
                <div className="p-2 rounded bg-black/40 border border-white/[0.04]">
                  7. Concised Natural Operator Response
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
