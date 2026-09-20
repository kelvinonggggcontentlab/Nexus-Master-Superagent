import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  Smartphone,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  LogOut,
  Fingerprint,
  Cpu,
  Clock,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { SecurityStatusView, TrustedDeviceView, SecurityEventView } from '../types/nexus';

interface SecurityCenterProps {
  onLockNexus: () => void;
  onRefreshAuth: () => void;
}

export const SecurityCenter: React.FC<SecurityCenterProps> = ({ onLockNexus, onRefreshAuth }) => {
  const [status, setStatus] = useState<SecurityStatusView | null>(null);
  const [devices, setDevices] = useState<TrustedDeviceView[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityEventView[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'audit' | 'policies'>('overview');
  const [autoLockVal, setAutoLockVal] = useState<number>(15);
  const [autonomousVal, setAutonomousVal] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    loadSecurityData();
  }, []);

  const loadSecurityData = async () => {
    try {
      setLoading(true);
      const [statusRes, devRes, auditRes] = await Promise.all([
        fetch('/api/auth/status'),
        fetch('/api/auth/devices'),
        fetch('/api/auth/audit-log'),
      ]);

      if (statusRes.ok) {
        const d = await statusRes.json();
        setStatus(d);
        setAutoLockVal(d.autoLockMinutes || 15);
        setAutonomousVal(d.autonomousActionsEnabled !== false);
      }
      if (devRes.ok) {
        const d = await devRes.json();
        setDevices(d.devices || []);
      }
      if (auditRes.ok) {
        const d = await auditRes.json();
        setAuditLogs(d.events || []);
      }
    } catch (e) {
      console.error('Failed to load security posture', e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateConfig = async (minutes?: number, autonomous?: boolean) => {
    try {
      const res = await fetch('/api/auth/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoLockMinutes: minutes !== undefined ? minutes : autoLockVal,
          autonomousActionsEnabled: autonomous !== undefined ? autonomous : autonomousVal,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setStatus(d.status);
        setFeedback('Security configuration updated successfully.');
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    try {
      const res = await fetch(`/api/auth/devices/${deviceId}`, { method: 'DELETE' });
      if (res.ok) {
        setDevices(prev => prev.filter(d => d.id !== deviceId));
        setFeedback('Device access revoked and sessions invalidated.');
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 text-slate-200">
      {/* Sub-tabs */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] pb-2 text-xs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
            activeTab === 'overview'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Security Posture</span>
        </button>
        <button
          onClick={() => setActiveTab('devices')}
          className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
            activeTab === 'devices'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Trusted Devices ({devices.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
            activeTab === 'audit'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Audit Log ({auditLogs.length})</span>
        </button>
      </div>

      {feedback && (
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{feedback}</span>
        </div>
      )}

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Identity Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#12141a] to-[#0b0c10] border border-cyan-500/30 relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white text-sm">BLACKTOWER™ Master Gateway</h3>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                      Hardware Passkey Enclave
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {status?.user?.email || 'kelvinong.gggcontentlab@gmail.com'} • Role: {status?.user?.role || 'owner'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {status?.isLocked ? (
                  <span className="px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> Locked
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Enclave Active
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-white/[0.06]">
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Sessions</div>
                <div className="text-sm font-semibold text-white mt-0.5">{status?.activeSessionCount || 1} Active</div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Enclave Devices</div>
                <div className="text-sm font-semibold text-white mt-0.5">{status?.trustedDeviceCount || 1} Enrolled</div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Idle Timeout</div>
                <div className="text-sm font-semibold text-white mt-0.5">{autoLockVal} Minutes</div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Autonomous Execution</div>
                <div className="text-sm font-semibold text-cyan-400 mt-0.5">
                  {autonomousVal ? 'Autonomous Allowed' : 'Strict Approval'}
                </div>
              </div>
            </div>
          </div>

          {/* Emergency Lock NEXUS Trigger */}
          <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-red-400 font-semibold text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>Emergency "Lock NEXUS" Action</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 max-w-md">
                Immediately revokes all active sessions, terminates in-flight autonomous operations, and freezes all tool execution until re-authenticated.
              </p>
            </div>
            <button
              onClick={onLockNexus}
              className="px-4 py-2 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-semibold text-xs transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] flex items-center gap-2 whitespace-nowrap"
            >
              <Lock className="w-4 h-4" />
              <span>Lock NEXUS Now</span>
            </button>
          </div>

          {/* Security Controls & Policies */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
              Runtime Security Policies
            </h4>

            {/* Auto-Lock Idle Timeout */}
            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="text-xs font-medium text-slate-200">Auto-Lock Inactivity Timeout</div>
                <p className="text-[11px] text-slate-400">
                  Automatically invalidate session after idle duration.
                </p>
              </div>
              <select
                value={autoLockVal}
                onChange={e => {
                  const val = parseInt(e.target.value, 10);
                  setAutoLockVal(val);
                  handleUpdateConfig(val, undefined);
                }}
                className="bg-[#12141a] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value={5}>5 Minutes</option>
                <option value={15}>15 Minutes (Default)</option>
                <option value={30}>30 Minutes</option>
                <option value={60}>60 Minutes</option>
              </select>
            </div>

            {/* Autonomous Actions Kill Switch */}
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
              <div>
                <div className="text-xs font-medium text-slate-200">Autonomous Write Actions</div>
                <p className="text-[11px] text-slate-400">
                  Allow NEXUS to execute write actions (drafting, relocating, updating) within verified plans.
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !autonomousVal;
                  setAutonomousVal(next);
                  handleUpdateConfig(undefined, next);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autonomousVal ? 'bg-cyan-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    autonomousVal ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRUSTED DEVICES TAB */}
      {activeTab === 'devices' && (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-400">
            Enrolled hardware enclaves and trusted passkey devices authorized to access the BLACKTOWER™ Gateway.
          </p>

          <div className="space-y-2">
            {devices.map(d => (
              <div
                key={d.id}
                className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{d.label}</span>
                      {d.isCurrentDevice && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                          Current Device
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Platform: {d.platform} • Registered: {new Date(d.registeredAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {!d.isCurrentDevice && (
                  <button
                    onClick={() => handleRevokeDevice(d.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Revoke device access"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AUDIT LOG TAB */}
      {activeTab === 'audit' && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400">
            Immutable cryptographic security event ledger with automated secret redaction.
          </p>

          <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
            {auditLogs.map(log => (
              <div
                key={log.id}
                className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-start justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-semibold uppercase text-[10px]">
                      [{log.type}]
                    </span>
                    <span className="text-slate-300 text-xs">
                      {log.details?.message || JSON.stringify(log.details)}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[9px] mt-0.5">
                    ID: {log.id} • IP: {log.details?.ip || '127.0.0.1'}
                  </div>
                </div>
                <span className="text-slate-500 text-[10px] whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
