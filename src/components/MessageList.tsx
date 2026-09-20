import React, { useRef, useEffect } from 'react';
import { NexusMessage } from '../types/nexus';
import { ExecutionStatusCard } from './ExecutionStatusCard';
import { FileText, Bot } from 'lucide-react';

interface MessageListProps {
  messages: NexusMessage[];
  onSelectPrompt: (prompt: string) => void;
  onConfirmStep?: (runId: string, stepId: string, confirmed: boolean) => void;
  isLoading?: boolean;
}

const SAMPLE_COMMANDS = [
  {
    title: 'Autonomous Invoice Summary & Archive',
    prompt: 'Find my latest invoice, summarize it and save the summary next to the original.',
    tag: 'Autopilot Flow',
  },
  {
    title: 'Executive Pitch Deck Summary & Dispatch',
    prompt: 'Search Drive for the latest Brand Campaign pitch deck, analyze key messaging hooks, and email executive summary to operator@example.com.',
    tag: 'Workspace Pipeline',
  },
  {
    title: 'Calendar Scan & Meeting Scheduler',
    prompt: "Check tomorrow's calendar for open slots and book a 1-hour Creative Ideation Sprint with the team at 11am.",
    tag: 'Schedule Auto-Book',
  },
  {
    title: 'Synthesize Innovation Roadmap Delta',
    prompt: 'Search Drive for Innovation Strategy documents and compare version highlights with previous roadmap files.',
    tag: 'Multi-Doc Diff',
  },
  {
    title: 'Deterministic Budget Calculation',
    prompt: 'Calculate 18% creative agency commission on 125,000 production budget.',
    tag: 'Verified Math',
  },
  {
    title: 'Deep Work Slot Reservation',
    prompt: "Check tomorrow's calendar and find a free 2-hour uninterrupted creative deep work window.",
    tag: 'Calendar Autopilot',
  },
];

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  onSelectPrompt,
  onConfirmStep,
  isLoading,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-3xl mx-auto w-full">
        {/* Minimal Blacktower Emblem */}
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#181a20] to-[#0c0d12] border border-cyan-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.12)]">
            <span className="font-orbitron text-2xl font-black tracking-tighter text-cyan-400">N</span>
          </div>
          <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded bg-[#090a0d] border border-white/10 text-[9px] font-orbitron tracking-widest text-slate-400">
            BT™
          </div>
        </div>

        {/* Minimal Greeting */}
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-100 tracking-tight text-center mb-2">
          What do you need done?
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 text-center max-w-md mb-8">
          Describe what you want. NEXUS autonomously determines connectors, tools, ordering, and verifies the outcome across Google Workspace.
        </p>

        {/* Sample Command Chips */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
          {SAMPLE_COMMANDS.map((item, i) => (
            <button
              key={i}
              onClick={() => onSelectPrompt(item.prompt)}
              className="flex flex-col text-left p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-cyan-500/30 transition-all group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-200 group-hover:text-cyan-300 transition-colors">
                  {item.title}
                </span>
                <span className="text-[10px] text-slate-500 font-mono px-1.5 py-0.2 rounded bg-white/[0.03]">
                  {item.tag}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                "{item.prompt}"
              </p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full space-y-6">
      {messages.map(msg => (
        <div
          key={msg.id}
          className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {msg.role === 'assistant' && (
            <div className="w-7 h-7 rounded-lg bg-[#14161d] border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <Bot className="w-4 h-4 text-cyan-400" />
            </div>
          )}

          <div
            className={`flex flex-col max-w-[88%] sm:max-w-[80%] ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            {/* Attachment preview if user uploaded */}
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {msg.attachments.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs text-slate-300"
                  >
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="truncate max-w-[140px]">{file.name}</span>
                    <span className="text-[10px] text-slate-500">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Execution status card for assistant messages with an execution run */}
            {msg.role === 'assistant' && msg.executionRun && (
              <div className="w-full">
                <ExecutionStatusCard
                  executionRun={msg.executionRun}
                  onConfirmStep={onConfirmStep}
                />
              </div>
            )}

            {/* Message Body */}
            <div
              className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-cyan-600/90 to-blue-700/90 text-white rounded-br-sm shadow-md'
                  : 'bg-[#111318]/90 text-slate-200 border border-white/[0.06] rounded-bl-sm shadow-sm'
              }`}
            >
              {msg.content}
            </div>

            <span className="text-[10px] text-slate-500 mt-1 px-1">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      ))}

      {/* Loading state bubble */}
      {isLoading && (
        <div className="flex gap-3 justify-start items-start">
          <div className="w-7 h-7 rounded-lg bg-[#14161d] border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          </div>
          <div className="px-4 py-2.5 rounded-2xl bg-[#111318] border border-white/[0.06] text-xs text-slate-400 flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.2s]" />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.4s]" />
            <span className="ml-1 text-slate-300">NEXUS is orchestrating actions...</span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
