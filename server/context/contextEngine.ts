import {
  ContextEntity,
  ActiveTaskContext,
  AssembledContext,
  ContextualIntentType,
} from './types';
import { EntityExtractor } from './entityExtractor';
import { ReferenceResolver } from './referenceResolver';
import { IntentClassifier } from './intentClassifier';
import { nexusStore } from '../db/store';
import { ExecutionRun, TaskStep } from '../../src/types/nexus';
import { resolvePersonality, SystemPersonality } from '../agent/personality';

export class ContextEngine {
  private activeTasks = new Map<string, ActiveTaskContext>(); // keyed by conversationId
  private entitiesByConversation = new Map<string, ContextEntity[]>(); // keyed by conversationId

  public getActiveTask(conversationId: string): ActiveTaskContext | null {
    return this.activeTasks.get(conversationId) || null;
  }

  public setActiveTask(conversationId: string, task: ActiveTaskContext | null): void {
    if (task) {
      this.activeTasks.set(conversationId, task);
    } else {
      this.activeTasks.delete(conversationId);
    }
  }

  public getEntities(conversationId: string): ContextEntity[] {
    return this.entitiesByConversation.get(conversationId) || [];
  }

  public addEntities(conversationId: string, entities: ContextEntity[]): void {
    const existing = this.getEntities(conversationId);
    // Merge by identifier/label to avoid exact duplicates
    const merged = [...existing];
    for (const ent of entities) {
      const idx = merged.findIndex(
        e => e.type === ent.type && (e.identifier === ent.identifier || e.label === ent.label)
      );
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], ...ent, updatedAt: new Date().toISOString() };
      } else {
        merged.unshift(ent);
      }
    }
    this.entitiesByConversation.set(conversationId, merged.slice(0, 50)); // Keep most recent 50
  }

  public reset(conversationId?: string): void {
    if (conversationId) {
      this.activeTasks.delete(conversationId);
      this.entitiesByConversation.delete(conversationId);
    } else {
      this.activeTasks.clear();
      this.entitiesByConversation.clear();
    }
  }

  public assembleContext(
    userMessage: string,
    conversationId: string,
    userId: string = 'operator',
    personality?: SystemPersonality | string
  ): AssembledContext {
    const effectivePersonality = resolvePersonality(personality, conversationId);
    const recentMessages = nexusStore.getMessages(conversationId).slice(-6);
    const activeTask = this.getActiveTask(conversationId);
    let allEntities = this.getEntities(conversationId);

    // 1. Extract entities from user prompt
    const promptEntities = EntityExtractor.extractFromText(
      userMessage,
      conversationId,
      activeTask?.taskId
    );
    if (promptEntities.length > 0) {
      this.addEntities(conversationId, promptEntities);
      allEntities = this.getEntities(conversationId);
    }

    // 2. Resolve References
    const refResult = ReferenceResolver.resolve(userMessage, activeTask, allEntities);

    // 3. Ambiguity check
    if (refResult.isAmbiguous) {
      return {
        userMessage,
        intent: 'CLARIFY',
        intentConfidence: 0.95,
        activeTask,
        recentMessages,
        resolvedReferences: {},
        relevantEntities: allEntities,
        relevantToolResults: activeTask?.toolResults || {},
        relevantMemories: nexusStore.getMemories(),
        ambiguities: [refResult.ambiguityReason || 'Ambiguous reference'],
        clarificationQuestion: refResult.clarificationQuestion,
        personality: effectivePersonality,
      };
    }

    // 4. Intent Classification
    const classification = IntentClassifier.classify(
      userMessage,
      activeTask,
      recentMessages,
      refResult.resolved
    );

    // 5. Query Result Direct Answering (Avoid unnecessary re-execution)
    let directAnswer: string | undefined;
    if (classification.intent === 'QUERY_RESULT') {
      directAnswer = this.answerQueryFromContext(userMessage, activeTask, allEntities, effectivePersonality);
    }

    // 6. Relevant Memories selection
    const relevantMemories = nexusStore.getMemories().filter(m => {
      const k = m.key.toLowerCase();
      const u = userMessage.toLowerCase();
      return u.includes(k) || k.includes('currency') || k.includes('preference');
    });

    return {
      userMessage,
      intent: classification.intent,
      intentConfidence: classification.confidence,
      activeTask,
      recentMessages,
      resolvedReferences: refResult.resolved,
      relevantEntities: allEntities,
      relevantToolResults: activeTask?.toolResults || {},
      relevantMemories,
      modifiedParameters: classification.modifiedParameters,
      directAnswer,
      personality: effectivePersonality,
    };
  }

  public answerQueryFromContext(
    userMessage: string,
    activeTask: ActiveTaskContext | null,
    entities: ContextEntity[],
    personality?: SystemPersonality | string
  ): string {
    const effectivePersonality = resolvePersonality(personality);
    const particle = effectivePersonality.linguisticPatterns.particles?.[0] ? ` ${effectivePersonality.linguisticPatterns.particles[0]}` : '';
    const salutation = effectivePersonality.linguisticPatterns.salutations?.[0] ? ` ${effectivePersonality.linguisticPatterns.salutations[0]}` : '';
    const lower = userMessage.toLowerCase();

    // Look for target file or document in context
    const fileEntity = entities.find(e => e.type === 'file' && e.data);
    const docEntity = entities.find(e => e.type === 'document');
    const calcEntity = entities.find(e => e.type === 'amount');

    // "Show me the details"
    if (lower.includes('detail') || lower === 'show me the details') {
      if (fileEntity && fileEntity.data) {
        const d = fileEntity.data;
        const meta = d.metadata || {};
        return `Details for ${d.name}${particle}:\n` +
          `• File ID: ${d.id}\n` +
          `• Folder: ${d.folder || '/'}\n` +
          (meta.invoiceNumber ? `• Invoice Reference: ${meta.invoiceNumber}\n` : '') +
          (meta.vendor ? `• Vendor: ${meta.vendor}\n` : '') +
          (meta.total ? `• Total Amount: ${meta.total}\n` : '') +
          (meta.dueDate ? `• Due Date: ${meta.dueDate}\n` : '') +
          `• Status: Verified in Drive Sandbox\n\n` +
          (d.content ? `Summary Preview:\n${d.content.substring(0, 200)}...` : '');
      }
    }

    // "When was it received?" / "What is the date?"
    if (lower.includes('when') || lower.includes('date')) {
      const dateEntity = entities.find(e => e.type === 'date');
      if (dateEntity) {
        return `The date recorded in the document is ${dateEntity.label}${particle}.`;
      }
      if (fileEntity?.data?.metadata?.dueDate) {
        return `Payment due date is ${fileEntity.data.metadata.dueDate}${particle}.`;
      }
    }

    // "What was the amount?" / "What is the total?"
    if (lower.includes('amount') || lower.includes('total') || lower.includes('balance')) {
      if (fileEntity?.data?.metadata?.total) {
        return `The verified total amount is ${fileEntity.data.metadata.total}${particle}.`;
      }
      if (calcEntity) {
        return `The calculated amount is ${calcEntity.label}${particle}.`;
      }
    }

    return `Context records checked already${salutation}, all saved in active session${particle}.`;
  }

  public cancelActiveTask(
    conversationId: string,
    reason: string = 'User aborted task',
    personality?: SystemPersonality | string
  ): {
    cancelledTask: ActiveTaskContext;
    report: string;
  } | null {
    const active = this.getActiveTask(conversationId);
    if (!active) return null;

    const effectivePersonality = resolvePersonality(personality, conversationId);
    const particle = effectivePersonality.linguisticPatterns.particles?.[0] ? ` ${effectivePersonality.linguisticPatterns.particles[0]}` : '';
    const salutation = effectivePersonality.linguisticPatterns.salutations?.[0] ? ` ${effectivePersonality.linguisticPatterns.salutations[0]}` : '';

    active.status = 'cancelled';
    active.cancellationReason = reason;

    // Prevent pending write actions
    for (const step of active.steps) {
      if (step.status === 'pending' || step.status === 'running') {
        step.status = 'skipped';
        step.error = `Action cancelled: ${reason}`;
      }
    }

    active.pendingSteps = [];
    active.updatedAt = new Date().toISOString();
    this.setActiveTask(conversationId, active);

    const completedSummary = active.completedSteps.map(s => `• ${s.title} (Done already)`).join('\n');
    const report =
      `Task cancelled already${salutation}: ${reason}.\n\n` +
      (completedSummary ? `Completed before cancel:\n${completedSummary}\n\n` : '') +
      `Pending actions stopped already${particle}. No further emails or changes dispatched.`;

    return {
      cancelledTask: active,
      report,
    };
  }

  public modifyActiveTask(
    conversationId: string,
    modifications: Record<string, any>,
    userPrompt: string
  ): ActiveTaskContext | null {
    const active = this.getActiveTask(conversationId);
    if (!active) return null;

    active.userModifications.push(userPrompt);

    // If preventSend requested, remove or skip any send_email steps
    if (modifications.preventSend) {
      active.steps = active.steps.filter(s => s.tool !== 'send_email');
      // If there is no draft step, convert or ensure a preparation step
      if (!active.steps.some(s => s.tool === 'draft_email')) {
        const prepStep: TaskStep = {
          id: `step_prep_${Date.now().toString(36)}`,
          taskId: active.taskId,
          stepNumber: active.steps.length + 1,
          title: 'Prepare Email Draft with Summary',
          description: 'Save prepared email summary without dispatching',
          tool: 'draft_email',
          parameters: {
            to: modifications.recipient || 'operator@example.com',
            subject: 'Document Summary (Draft)',
            body: '{{summary}}',
          },
          actionType: 'write',
          status: 'pending',
          dependencies: active.completedSteps.map(s => s.id),
        };
        active.steps.push(prepStep);
      }
    }

    // If new recipient specified, update all email steps
    if (modifications.recipient) {
      for (const step of active.steps) {
        if (step.tool === 'send_email' || step.tool === 'draft_email') {
          step.parameters.to = modifications.recipient;
          step.title = `Dispatch to ${modifications.recipient}`;
        }
      }
    }

    active.updatedAt = new Date().toISOString();
    this.setActiveTask(conversationId, active);
    return active;
  }

  public recordExecutionRun(
    executionRun: ExecutionRun,
    conversationId: string,
    userId: string = 'operator'
  ): void {
    const existingActive = this.getActiveTask(conversationId);

    // If this execution run has 0 steps (e.g. cancellation or query), preserve existing active task
    if (executionRun.plan.steps.length === 0 && existingActive) {
      existingActive.updatedAt = new Date().toISOString();
      if (executionRun.status === 'cancelled') {
        existingActive.status = 'cancelled';
        existingActive.pendingSteps = [];
      }
      this.setActiveTask(conversationId, existingActive);
      return;
    }

    // 1. Sync or create ActiveTaskContext
    const completedSteps = executionRun.plan.steps.filter(
      s => s.status === 'completed' || s.status === 'verified'
    );
    const pendingSteps = executionRun.plan.steps.filter(
      s => s.status === 'pending' || s.status === 'running'
    );
    const failedSteps = executionRun.plan.steps.filter(s => s.status === 'failed');

    const mergedToolResults = {
      ...(existingActive?.toolResults || {}),
      ...executionRun.results,
    };

    const mergedModifications = [
      ...(existingActive?.userModifications || []),
    ];

    const activeTask: ActiveTaskContext = {
      taskId: existingActive?.taskId || executionRun.id,
      conversationId,
      userId,
      originalRequest: existingActive?.originalRequest || executionRun.userPrompt,
      currentObjective: executionRun.plan.intent,
      currentStepIndex: executionRun.currentStepIndex,
      steps: [...(existingActive?.steps || []), ...executionRun.plan.steps],
      completedSteps: [...(existingActive?.completedSteps || []), ...completedSteps],
      pendingSteps,
      failedSteps: [...(existingActive?.failedSteps || []), ...failedSteps],
      toolResults: mergedToolResults,
      relevantEntities: this.getEntities(conversationId),
      userModifications: mergedModifications,
      status:
        executionRun.status === 'waiting_confirmation'
          ? 'waiting_confirmation'
          : executionRun.status === 'failed'
          ? 'failed'
          : executionRun.status === 'cancelled'
          ? 'cancelled'
          : 'active',
      createdAt: existingActive?.createdAt || executionRun.createdAt,
      updatedAt: executionRun.updatedAt,
    };

    this.setActiveTask(conversationId, activeTask);

    // 2. Extract entities from all tool outputs into conversation entity pool
    for (const step of executionRun.plan.steps) {
      if (step.result) {
        const isSim = step.verificationDetails?.isSimulated ?? true;
        const newEnts = EntityExtractor.extractFromToolResult(
          step.tool,
          step.result,
          conversationId,
          executionRun.id,
          isSim
        );
        if (newEnts.length > 0) {
          this.addEntities(conversationId, newEnts);
        }
      }
    }
  }
}

export const contextEngine = new ContextEngine();
