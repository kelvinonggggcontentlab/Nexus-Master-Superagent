import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { ExecutionRun, TaskStep } from '../types/nexus';

interface ExecutionStatusCardProps {
  executionRun: ExecutionRun;
  onConfirmStep?: (runId: string, stepId: string, confirmed: boolean) => void;
}

export const ExecutionStatusCard: React.FC<ExecutionStatusCardProps> = ({
  executionRun,
  onConfirmStep,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isRunning = executionRun.status === 'in_progress' || executionRun.status === 'planning' || executionRun.status === 'replanning';
  const isFailed = executionRun.status === 'failed';
  const isWaiting = executionRun.status === 'waiting_confirmation';

  // Automatically show details when user authorization is required
  const showExpanded = isExpanded || isWaiting;

  const completedCount = executionRun.plan?.steps?.filter(
    s => s.status === 'completed' || s.status === 'verified'
  ).length || 0;
  const totalSteps = executionRun.plan?.steps?.length || 0;

  return (
    <div className="my-2.5 rounded-xl bg-[#111318]/90 border border-white/[0.08] overflow-hidden transition-all shadow-sm">
      {/* Summary Trigger Bar */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {isRunning && (
            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin flex-shrink-0" />
          )}
          {!isRunning && !isFailed && !isWaiting && (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          )}
          {isWaiting && (
            <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
          )}
          {isFailed && (
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          )}

          <div className="flex items-center gap-2 truncate">
            <span className="text-xs font-medium text-slate-200 truncate">
              {isRunning
                ? executionRun.activeStatusText || 'NEXUS is autonomously orchestrating tasks...'
                : isWaiting
                ? 'Authorization required to proceed'
                : isFailed
                ? 'Autopilot execution paused'
                : `Autopilot task complete — ${totalSteps}/${totalSteps} operations verified`}
            </span>
            <span className="text-[10px] text-slate-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06] flex-shrink-0">
              {completedCount}/{totalSteps} steps
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 flex-shrink-0 ml-2">
          <span>{showExpanded ? 'Hide work' : 'Show work'}</span>
          {showExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </div>
      </button>

      {/* Expandable Step Breakdown */}
      {showExpanded && (
        <div className="px-3.5 pb-3 pt-1 border-t border-white/[0.04] bg-[#0c0d12]/70 space-y-2">
          {executionRun.plan?.steps?.map((step: TaskStep, index: number) => {
            const isStepDone = step.status === 'completed' || step.status === 'verified';
            const isStepRunning = step.status === 'running';
            const isStepFailed = step.status === 'failed';

            return (
              <div
                key={step.id || index}
                className="flex items-start justify-between py-1 text-xs border-b border-white/[0.02] last:border-0"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5">
                    {isStepDone && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    {isStepRunning && (
                      <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                    )}
                    {isStepFailed && (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    {!isStepDone && !isStepRunning && !isStepFailed && (
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex items-center justify-center text-[9px] text-slate-500">
                        {step.stepNumber}
                      </div>
                    )}
                  </span>

                  <div>
                    <div className="font-medium text-slate-200 flex items-center gap-1.5">
                      <span>{step.title}</span>
                      {step.verificationDetails?.isSimulated && (
                        <span className="text-[9px] font-mono text-cyan-400/80 bg-cyan-950/40 px-1 py-0.2 rounded border border-cyan-800/30">
                          Sandbox
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">{step.description}</div>
                    {step.verificationDetails?.message && (
                      <div className="text-[10px] text-emerald-400/90 mt-0.5 flex items-center gap-1">
                        <span>✓</span>
                        <span>{step.verificationDetails.message}</span>
                      </div>
                    )}
                    {step.error && (
                      <div className="text-[10px] text-rose-400 mt-0.5">
                        Error: {step.error}
                      </div>
                    )}
                  </div>
                </div>

                <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.04] ml-2 flex-shrink-0">
                  {step.tool}
                </span>
              </div>
            );
          })}

          {/* Action confirmation if waiting */}
          {isWaiting && onConfirmStep && (
            <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
              <p className="font-medium mb-1">Confirmation Required for Destructive Action</p>
              <p className="text-[11px] text-amber-300/80 mb-2.5">
                This operation will delete or modify persistent records ya. Confirm want to proceed boss?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const pending = executionRun.plan.steps.find(s => s.status === 'pending');
                    if (pending) onConfirmStep(executionRun.id, pending.id, true);
                  }}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded text-xs transition-all"
                >
                  Confirm & Settle
                </button>
                <button
                  onClick={() => {
                    const pending = executionRun.plan.steps.find(s => s.status === 'pending');
                    if (pending) onConfirmStep(executionRun.id, pending.id, false);
                  }}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 text-slate-300 rounded text-xs transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
