import React from 'react';
import { X, MessageSquare, Trash2, Plus } from 'lucide-react';
import { ConversationSession } from '../types/nexus';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ConversationSession[];
  currentSessionId?: string;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewChat: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onNewChat,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-start bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-[#0b0c10] border-r border-white/[0.08] flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">Conversations</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New Session Button */}
        <div className="p-3 border-b border-white/[0.04]">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-medium border border-cyan-500/30 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Start Fresh Session</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-500">
              No previous conversations.
            </div>
          ) : (
            sessions.map(s => {
              const isSelected = s.id === currentSessionId;
              return (
                <div
                  key={s.id}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all ${
                    isSelected
                      ? 'bg-white/[0.08] text-white border border-white/[0.08]'
                      : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
                  }`}
                >
                  <button
                    onClick={() => {
                      onSelectSession(s.id);
                      onClose();
                    }}
                    className="flex-1 text-left truncate mr-2"
                  >
                    <div className="font-medium truncate">{s.title || 'Conversation'}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {new Date(s.updatedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </button>

                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-rose-400 hover:bg-white/[0.05] transition-all"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
