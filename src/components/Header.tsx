import React, { useState, useEffect } from 'react';
import { Plus, History, Activity, Settings, CheckCircle, AlertCircle, Sparkles, Shield, Lock } from 'lucide-react';
import { auth, googleSignIn } from '../lib/googleAuth';
import { User, onAuthStateChanged } from 'firebase/auth';

interface HeaderProps {
  onNewChat: () => void;
  onOpenHistory: () => void;
  onOpenObservability: () => void;
  onOpenSettings: () => void;
  onEmergencyLock?: () => void;
  isLocked?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onNewChat,
  onOpenHistory,
  onOpenObservability,
  onOpenSettings,
  onEmergencyLock,
  isLocked = false,
}) => {
  const [authUser, setAuthUser] = useState<User | null>(auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthUser(user);
    });
    return () => unsub();
  }, []);

  const handleQuickSignIn = async () => {
    try {
      await googleSignIn();
    } catch (e) {
      console.error(e);
      onOpenSettings();
    }
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3.5 bg-[#090a0d]/90 backdrop-blur-md border-b border-white/[0.06]">
      {/* Brand Identity */}
      <div className="flex items-center gap-3">
        <button
          onClick={onNewChat}
          className="flex items-center gap-2.5 text-left group transition-all"
          title="Start fresh session"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1a1c23] to-[#0d0e12] border border-cyan-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.15)] group-hover:border-cyan-400/60 transition-all">
            <span className="font-orbitron font-bold text-xs text-cyan-400">N</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-orbitron font-bold text-sm tracking-wider text-white">NEXUS</span>
              <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400 font-medium border border-white/[0.08]">
                BLACKTOWER™
              </span>
            </div>
            <span className="text-[10px] text-slate-500 tracking-tight font-medium hidden sm:inline">
              Master Intelligence Layer
            </span>
          </div>
        </button>

        {/* Live Security & Enclave status */}
        <div className="hidden md:flex items-center gap-1.5 ml-4 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px] font-medium">
          <Shield className="w-3 h-3 text-cyan-400" />
          <span>Passkey Enclave Active</span>
        </div>
      </div>

      {/* Control Actions & Workspace Indicator */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Workspace Quick-State Badge */}
        {authUser ? (
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium transition-all"
            title={`Connected to Google Workspace as ${authUser.email}`}
          >
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline truncate max-w-[130px]">{authUser.displayName || 'Workspace Active'}</span>
          </button>
        ) : (
          <button
            id="btn-header-signin"
            onClick={handleQuickSignIn}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-300 text-xs font-medium transition-all"
            title="Connect Google Workspace (Drive, Gmail, Calendar)"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Connect Google</span>
          </button>
        )}

        <button
          id="btn-new-chat"
          onClick={onNewChat}
          className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] text-slate-300 text-xs font-medium border border-white/[0.06] transition-all hover:text-white"
          title="New Chat"
        >
          <Plus className="w-4 h-4 text-cyan-400" />
          <span className="hidden sm:inline">New</span>
        </button>

        <button
          id="btn-history"
          onClick={onOpenHistory}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] active:bg-white/[0.1] border border-transparent hover:border-white/[0.06] transition-all"
          title="Conversations & History"
          aria-label="Conversations & History"
        >
          <History className="w-4 h-4" />
        </button>

        <button
          id="btn-observability"
          onClick={onOpenObservability}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-white/[0.05] active:bg-white/[0.1] border border-transparent hover:border-white/[0.06] transition-all"
          title="Observability & Task Graphs"
          aria-label="Observability & Task Graphs"
        >
          <Activity className="w-4 h-4" />
        </button>

        {/* Emergency Lock NEXUS Trigger in Header */}
        {onEmergencyLock && (
          <button
            id="btn-header-lock"
            onClick={onEmergencyLock}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 active:bg-red-500/20 border border-transparent hover:border-red-500/30 transition-all"
            title="Emergency Lock NEXUS"
            aria-label="Emergency Lock NEXUS"
          >
            <Lock className="w-4 h-4" />
          </button>
        )}

        <button
          id="btn-settings"
          onClick={onOpenSettings}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] active:bg-white/[0.1] border border-transparent hover:border-white/[0.06] transition-all"
          title="Settings & Security Gateway"
          aria-label="Settings & Security Gateway"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
