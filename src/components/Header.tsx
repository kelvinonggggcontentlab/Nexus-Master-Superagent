import React from 'react';
import { Plus, History, Activity, Settings } from 'lucide-react';

interface HeaderProps {
  onNewChat: () => void;
  onOpenHistory: () => void;
  onOpenObservability: () => void;
  onOpenSettings: () => void;
  activeSessionTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onNewChat,
  onOpenHistory,
  onOpenObservability,
  onOpenSettings,
}) => {
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

        {/* Live Status indicator */}
        <div className="hidden md:flex items-center gap-1.5 ml-4 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Active</span>
        </div>
      </div>

      {/* Control Actions */}
      <div className="flex items-center gap-1 sm:gap-2">
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

        <button
          id="btn-settings"
          onClick={onOpenSettings}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] active:bg-white/[0.1] border border-transparent hover:border-white/[0.06] transition-all"
          title="Settings & Workspace Integrations"
          aria-label="Settings & Workspace Integrations"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
