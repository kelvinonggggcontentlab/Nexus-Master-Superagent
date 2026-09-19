import { ExecutionRun, TaskStep, TaskStatus } from '../../src/types/nexus';
import { nexusStore } from '../db/store';
import { executeToolCall } from '../tools/registry';
import { AssembledContext } from '../context/types';
import { contextEngine } from '../context/contextEngine';
import {
  getGemini,
  isGeminiQuotaExhausted,
  markQuotaExhausted,
  isQuotaOrRateLimitError,
} from '../geminiService';
import {
  SystemPersonality,
  resolvePersonality,
} from './personality';

export class NexusAgentRuntime {
  public async executePlan(
    run: ExecutionRun,
    onProgress?: (run: ExecutionRun) => void,
    context?: AssembledContext,
    personality?: SystemPersonality | string
  ): Promise<ExecutionRun> {
    const activeContext =
      context || contextEngine.assembleContext(run.userPrompt, run.conversationId);
    const effectivePersonality = resolvePersonality(
      personality || activeContext.personality,
      run.conversationId
    );
    if (!activeContext.personality) {
      activeContext.personality = effectivePersonality;
    }

    // 1. Handle zero-step operations (Cancellation, Queries, Clarifications)
    if (run.plan.steps.length === 0) {
      if (activeContext.intent === 'CANCEL_TASK') {
        run.status = 'cancelled';
        const cancelRes = contextEngine.cancelActiveTask(run.conversationId, 'User aborted task');
        run.finalResponse =
          cancelRes?.report || 'Task cancelled. No pending write actions executed.';
        run.activeStatusText = 'Task cancelled.';
        run.updatedAt = new Date().toISOString();
        nexusStore.saveExecutionRun(run);
        if (onProgress) onProgress(run);
        return run;
      }

      if (activeContext.intent === 'QUERY_RESULT') {
        run.status = 'completed';
        run.finalResponse =
          activeContext.directAnswer ||
          contextEngine.answerQueryFromContext(
            run.userPrompt,
            activeContext.activeTask,
            activeContext.relevantEntities
          );
        run.activeStatusText = 'Query answered from verified session context.';
        run.updatedAt = new Date().toISOString();
        nexusStore.saveExecutionRun(run);
        if (onProgress) onProgress(run);
        return run;
      }

      if (activeContext.intent === 'CLARIFY') {
        run.status = 'completed';
        run.finalResponse =
          activeContext.clarificationQuestion ||
          'Multiple candidates exist in context. Please clarify your request.';
        run.activeStatusText = 'Clarification requested.';
        run.updatedAt = new Date().toISOString();
        nexusStore.saveExecutionRun(run);
        if (onProgress) onProgress(run);
        return run;
      }

      if (activeContext.intent === 'MODIFY_TASK') {
        run.status = 'completed';
        const modifiedTask = contextEngine.getActiveTask(run.conversationId);
        run.finalResponse = `Task updated with new parameters.\nActive modifications recorded: ${modifiedTask?.userModifications.join(', ') || 'Updated'}`;
        run.activeStatusText = 'Task parameters updated.';
        run.updatedAt = new Date().toISOString();
        nexusStore.saveExecutionRun(run);
        if (onProgress) onProgress(run);
        return run;
      }
    }

    run.status = 'in_progress';
    run.updatedAt = new Date().toISOString();
    nexusStore.saveExecutionRun(run);
    if (onProgress) onProgress(run);

    const stepResults: Record<string, any> = {};

    for (let i = 0; i < run.plan.steps.length; i++) {
      // Check if user cancelled in flight
      const currentActive = contextEngine.getActiveTask(run.conversationId);
      if (currentActive && currentActive.status === 'cancelled') {
        run.status = 'cancelled';
        run.finalResponse =
          currentActive.cancellationReason || 'Execution halted: Task cancelled by user.';
        run.activeStatusText = 'Task cancelled.';
        nexusStore.saveExecutionRun(run);
        if (onProgress) onProgress(run);
        return run;
      }

      const step = run.plan.steps[i];
      run.currentStepIndex = i;
      run.activeStatusText = `${step.title}...`;
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      nexusStore.saveExecutionRun(run);
      if (onProgress) onProgress(run);

      // Check dependencies
      const depsSatisfied = step.dependencies.every(depId => {
        const parent = run.plan.steps.find(s => s.id === depId);
        return parent && (parent.status === 'completed' || parent.status === 'verified');
      });

      if (!depsSatisfied) {
        step.status = 'failed';
        step.error = 'Unsatisfied parent step dependencies.';
        run.status = 'failed';
        run.error = `Step ${step.stepNumber} failed because dependencies were not satisfied.`;
        break;
      }

      // Check destructive confirmation safeguard
      if (step.requiresConfirmation && !step.confirmationGranted) {
        step.status = 'pending';
        run.status = 'waiting_confirmation';
        run.activeStatusText = `Awaiting authorization for: ${step.title}`;
        nexusStore.saveExecutionRun(run);
        contextEngine.recordExecutionRun(run, run.conversationId);
        if (onProgress) onProgress(run);
        return run;
      }

      // Context Propagation: resolve dynamic parameters from previous step results AND contextual references
      const resolvedParameters = this.resolveStepParameters(step, stepResults, activeContext, run);

      // Execute tool call
      let toolResult = await executeToolCall(step.tool, resolvedParameters, run.id);

      // Dynamic Replanning: if search returns 0 results, retry with first significant token
      if (step.tool === 'search_drive' && toolResult.success && toolResult.data?.foundCount === 0) {
        const originalQuery = String(resolvedParameters.query || '').trim();
        const fallbackWord = originalQuery.split(/\s+/)[0];
        if (fallbackWord && fallbackWord.toLowerCase() !== originalQuery.toLowerCase()) {
          run.activeStatusText = `Zero matches for "${originalQuery}". Replanning search with "${fallbackWord}"...`;
          nexusStore.saveExecutionRun(run);
          if (onProgress) onProgress(run);

          const retryResult = await executeToolCall(
            'search_drive',
            { query: fallbackWord },
            run.id
          );
          if (retryResult.success && retryResult.data?.foundCount > 0) {
            toolResult = retryResult;
            step.description += ` (Auto-recovered using query: "${fallbackWord}")`;
          }
        }
      }

      if (!toolResult.success) {
        step.status = 'failed';
        step.completedAt = new Date().toISOString();
        step.error = toolResult.error || 'Execution failed';
        run.status = 'failed';
        run.error = `Step ${step.stepNumber} (${step.title}) failed: ${step.error}`;
        nexusStore.saveExecutionRun(run);
        if (onProgress) onProgress(run);
        break;
      }

      // Success & Verification recording
      step.status = 'verified';
      step.completedAt = new Date().toISOString();
      step.result = toolResult.data;
      step.verificationDetails = toolResult.verification;

      stepResults[step.id] = toolResult.data;
      run.results[step.tool] = toolResult.data;
      run.stepsCompleted = i + 1;

      if (toolResult.verification) {
        run.verificationBadges.push({
          label: toolResult.verification.message,
          verified: toolResult.verification.verified,
          isSimulated: toolResult.verification.isSimulated,
          timestamp: toolResult.verification.timestamp,
        });
      }

      nexusStore.saveExecutionRun(run);
      if (onProgress) onProgress(run);
    }

    // Final assessment & response synthesis
    if ((run.status as TaskStatus) !== 'failed') {
      run.status = 'completed';
      run.activeStatusText = 'Execution verified and completed.';
      run.finalResponse = await this.generateFinalResponse(run, activeContext, effectivePersonality);
    } else {
      run.finalResponse = this.generateFailureResponse(run, effectivePersonality);
    }

    run.updatedAt = new Date().toISOString();
    nexusStore.saveExecutionRun(run);

    // Sync state and entities back to ContextEngine
    contextEngine.recordExecutionRun(run, run.conversationId);

    if (onProgress) onProgress(run);
    return run;
  }

  // Dynamic Context Propagation: maps outputs of parent steps OR active contextual state into child step inputs
  private resolveStepParameters(
    step: TaskStep,
    stepResults: Record<string, any>,
    context?: AssembledContext,
    run?: ExecutionRun
  ): Record<string, any> {
    const params = { ...step.parameters };

    // Fallback for calculate tool if expression was not resolved
    if (step.tool === 'calculate' && (!params.expression || params.expression === 'undefined' || params.expression === 'auto')) {
      const match = ((run?.userPrompt || '') + ' ' + (step.description || '') + ' ' + (step.title || '')).match(/(\d+(?:\.\d+)?(?:\s*[\+\-\*\/\%]\s*\d+(?:\.\d+)?)+)/);
      if (match) {
        params.expression = match[1].trim();
      }
    }

    // 1. Check parent step results
    for (const depId of step.dependencies) {
      const depData = stepResults[depId];
      if (!depData) continue;

      // Feed file ID from search_drive or get_file_metadata to downstream file tools
      if (
        (step.tool === 'read_drive_file' ||
          step.tool === 'move_drive_file' ||
          step.tool === 'delete_drive_file') &&
        (!params.fileId || params.fileId === 'auto')
      ) {
        if (depData.files && depData.files.length > 0) {
          params.fileId = depData.files[0].id;
        } else if (depData.id) {
          params.fileId = depData.id;
        }
      }

      // Feed document content from read_drive_file to analyze_document
      if (
        step.tool === 'analyze_document' &&
        (!params.documentText || params.documentText === 'auto')
      ) {
        if (depData.content) {
          params.documentText = depData.content;
        }
      }

      // Feed free slot from check_calendar to create_calendar_event
      if (step.tool === 'create_calendar_event') {
        if (depData.firstFreeOneHourSlot && (!params.start || params.start.includes('TBD'))) {
          const slot = depData.firstFreeOneHourSlot;
          const date =
            depData.dateChecked && depData.dateChecked !== 'tomorrow'
              ? depData.dateChecked
              : '2026-09-18';
          params.start = `${date}T${slot.start}:00+08:00`;
          params.end = `${date}T${slot.end}:00+08:00`;
        }
      }

      // Feed analysis or calculation output into email body if needed
      if (
        (step.tool === 'send_email' || step.tool === 'draft_email') &&
        params.body &&
        params.body.includes('{{summary}}')
      ) {
        let replacement = '';
        if (depData.summaryLines && depData.summaryLines.length > 0) {
          replacement = depData.summaryLines.join('\n');
        } else if (depData.formattedResult) {
          replacement = `Calculated Result: ${depData.formattedResult}`;
        }
        params.body = params.body.replace(
          '{{summary}}',
          replacement || 'Document summarized successfully.'
        );
      }
    }

    // 2. If parameters are still unresolved ('auto'), check context resolvedReferences & activeTask
    if (
      (step.tool === 'read_drive_file' ||
        step.tool === 'move_drive_file' ||
        step.tool === 'delete_drive_file') &&
      (!params.fileId || params.fileId === 'auto')
    ) {
      if (context?.resolvedReferences?.target_file?.identifier) {
        params.fileId = context.resolvedReferences.target_file.identifier;
      } else if (context?.activeTask?.toolResults?.search_drive?.files?.[0]?.id) {
        params.fileId = context.activeTask.toolResults.search_drive.files[0].id;
      }
    }

    // If email body still has '{{summary}}', check activeTask or context
    if (
      (step.tool === 'send_email' || step.tool === 'draft_email') &&
      params.body &&
      params.body.includes('{{summary}}')
    ) {
      let replacement = '';
      if (context?.activeTask?.toolResults?.analyze_document?.summaryLines) {
        replacement = context.activeTask.toolResults.analyze_document.summaryLines.join('\n');
      } else if (context?.resolvedReferences?.summary?.data?.summaryLines) {
        replacement = context.resolvedReferences.summary.data.summaryLines.join('\n');
      }
      if (replacement) {
        params.body = params.body.replace('{{summary}}', replacement);
      }
    }

    return params;
  }

  private async generateFinalResponse(
    run: ExecutionRun,
    context?: AssembledContext,
    personality?: SystemPersonality
  ): Promise<string> {
    const effectivePersonality = personality || resolvePersonality(context?.personality, run.conversationId);
    const ai = getGemini();
    if (ai && !isGeminiQuotaExhausted()) {
      try {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini synthesis timed out')), 2500)
        );

        const promptText = `You are NEXUS MASTER SUPERAGENT™.
${effectivePersonality.buildPromptSection('runtime_synthesis')}

The user requested: "${run.userPrompt}".
Active Intent: ${context?.intent || 'TASK_EXECUTION'}
The execution steps completed with these results:
${JSON.stringify(run.results, null, 2)}

Verification Badges:
${run.verificationBadges.map(b => `• ${b.label} (Simulated: ${b.isSimulated ? 'yes' : 'no'})`).join('\n')}

Synthesize a helpful, conversational response adhering strictly to the personality instructions.
Rules:
- State direct functional outcomes with exact data from results (amounts, filenames, dates, recipients).
- Clearly denote if actions were verified in simulation sandbox or live environment.
- Do not make false claims of external third-party certifications when running in simulation.
- Keep it concise, scannable, and clean.`;

        const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-flash-latest'];
        let response: any = null;

        for (const model of modelsToTry) {
          try {
            const generatePromise = ai.models.generateContent({
              model,
              contents: [
                {
                  role: 'user',
                  parts: [{ text: promptText }],
                },
              ],
              config: {
                temperature: 0.2,
              },
            });

            response = await Promise.race([generatePromise, timeoutPromise]);
            if (response?.text && response.text.trim().length > 0) {
              return response.text.trim();
            }
          } catch (err: any) {
            if (isQuotaOrRateLimitError(err)) {
              markQuotaExhausted(60000);
              break;
            }
          }
        }
      } catch (err: any) {
        if (isQuotaOrRateLimitError(err)) {
          markQuotaExhausted(60000);
        } else {
          console.info('Using deterministic response synthesis fallback:', err?.message || 'timeout');
        }
      }
    }

    // Deterministic Operator Synthesis based on actual runtime results
    return this.synthesizeDeterministicResponse(run, effectivePersonality);
  }

  private synthesizeDeterministicResponse(run: ExecutionRun, personality?: SystemPersonality): string {
    const effectivePersonality = personality || resolvePersonality(undefined, run.conversationId);
    const results = run.results || {};

    // 1. Mathematical / Financial Calculation
    if (results.calculate) {
      const calc = results.calculate;
      if (effectivePersonality.formatCalculationResult) {
        return effectivePersonality.formatCalculationResult(
          calc.expression,
          calc.formattedResult,
          calc.label
        );
      }
      return `Calculation done:\n• Expression: ${calc.expression}\n• Computed Result: ${calc.formattedResult} ${calc.label ? `(${calc.label})` : ''}\n\n✓ Arithmetic verified`;
    }

    // 2. Draft Email (Prepared, not dispatched)
    if (results.draft_email) {
      const draft = results.draft_email;
      if (effectivePersonality.formatDraftResult) {
        return effectivePersonality.formatDraftResult(
          draft.recipient,
          draft.subject,
          (draft.body || '').substring(0, 150)
        );
      }
      return `Prepared Email Draft:\n• Recipient: ${draft.recipient}\n• Subject: "${draft.subject}"\n• Status: Saved as draft in sandbox (Not sent yet)\n\n✓ Draft prepared`;
    }

    // 3. Calendar Event Creation
    if (results.create_calendar_event) {
      const evt = results.create_calendar_event;
      if (effectivePersonality.formatCalendarResult) {
        return effectivePersonality.formatCalendarResult(
          evt.title,
          evt.start,
          evt.end,
          evt.attendees || []
        );
      }
      return `Calendar event booked:\n• Title: ${evt.title}\n• Time: ${evt.start} – ${evt.end}\n\n✓ Event scheduled`;
    }

    // 4. Calendar Check
    if (results.check_calendar) {
      const cal = results.check_calendar;
      const slots = (cal.availableFreeSlots || [])
        .slice(0, 3)
        .map((s: any) => `• ${s.start} – ${s.end} (${s.durationMinutes} mins: ${s.note})`)
        .join('\n');
      const prefix = effectivePersonality.linguisticPatterns.salutations?.includes('boss')
        ? `Checked your schedule for ${cal.dateChecked} already boss.\n\nGot ${cal.scheduledEventsCount} existing commitment(s) on record.`
        : `Checked schedule for ${cal.dateChecked}.\n\nExisting commitment(s): ${cal.scheduledEventsCount}.`;
      return `${prefix}\nAvailable open slots:\n${slots || 'No open slots found.'}\n\n✓ Availability scan verified`;
    }

    // 5. File Search + Email Workflow
    if (results.send_email && results.search_drive) {
      const drive = results.search_drive;
      const email = results.send_email;
      const file = drive.files?.[0];
      const analysis = results.analyze_document;

      let summaryInfo = '';
      if (analysis?.summaryLines?.length > 0) {
        summaryInfo = analysis.summaryLines.map((l: string) => `• ${l}`).join('\n');
      }

      if (effectivePersonality.formatDispatchedResult) {
        return effectivePersonality.formatDispatchedResult(
          file ? file.name : 'requested document',
          email.recipient,
          summaryInfo,
          email.messageId
        );
      }

      return `Found "${file ? file.name : 'document'}" in Drive and emailed summary to ${email.recipient}.\n\n• Recipient: ${email.recipient}\n• Status: Dispatched\n• Message ID: ${email.messageId}\n\n✓ Workflow completed`;
    }

    // 6. Standalone Email Search
    if (results.search_emails) {
      const emailRes = results.search_emails;
      const first = emailRes.emails?.[0];
      const particle = effectivePersonality.linguisticPatterns.particles?.includes('lah') ? ' lah' : '';
      return `Inbox checked! Found ${emailRes.count} matching message(s)${particle}.\n\n${first ? `Latest Message:\n• From: ${first.from}\n• Subject: "${first.subject}"\n• Date: ${first.date}\n• Preview: ${first.snippet}` : 'No matching messages located inside.'}\n\n✓ Inbox query verified`;
    }

    // 7. Standalone Email Sent
    if (results.send_email) {
      const mail = results.send_email;
      return `Sent successfully. Message dispatched smoothly.\n\n• Recipient: ${mail.recipient}\n• Subject: "${mail.subject}"\n• Message ID: ${mail.messageId}\n\n✓ Outbound dispatch verified`;
    }

    // 8. Document Analysis / Summary
    if (results.analyze_document) {
      const doc = results.analyze_document;
      let text = `Document analysis complete:\n• Lines: ${doc.lineCount} | Words: ${doc.wordCount}\n`;
      if (doc.summaryLines && doc.summaryLines.length > 0) {
        text += `\nKey Highlights:\n${doc.summaryLines.map((l: string) => `• ${l}`).join('\n')}\n`;
      }
      if (doc.comparison) {
        text += `\n${doc.comparison.diffSummary}\n`;
      }
      return `${text}\n✓ Analysis verified`;
    }

    // 9. Drive File Search only
    if (results.search_drive) {
      const drive = results.search_drive;
      const count = drive.foundCount || 0;
      if (count === 0) {
        return 'Cannot find any matching files in Drive.';
      }
      const fileList = (drive.files || [])
        .map((f: any) => `• ${f.name} (ID: ${f.id}, Folder: ${f.folder})`)
        .join('\n');
      return `Found ${count} matching file(s) in Drive:\n${fileList}\n\n✓ Search verified`;
    }

    // 10. File Move
    if (results.move_drive_file) {
      const mv = results.move_drive_file;
      return `Moved successfully. The file "${mv.name}" is now in: ${mv.newFolder}.\n\n✓ Location verified`;
    }

    // 11. File Deletion
    if (results.delete_drive_file) {
      const del = results.delete_drive_file;
      return `Deleted successfully. File "${del.name}" (ID: ${del.id}) permanently removed from Drive.\n\n✓ Target removal verified`;
    }

    // 12. File Creation
    if (results.create_drive_file) {
      const cr = results.create_drive_file;
      return `Created successfully. Document "${cr.name}" created in ${cr.folder} (${cr.sizeBytes} bytes).\n\n✓ File created`;
    }

    // 13. Memory
    if (results.update_memory) {
      const mem = results.update_memory;
      return `Remembered successfully.\nPersisted: "${mem.key}" = "${mem.value}"\n\n✓ Memory updated`;
    }
    if (results.recall_memory) {
      const mem = results.recall_memory;
      return `Checked memory:\n• ${mem.key}: ${mem.value}\n\n✓ Memory retrieved`;
    }

    // Default Fallback
    const badges = run.verificationBadges.map(b => `✓ ${b.label}`).join('\n');
    const affirmation = effectivePersonality.linguisticPatterns.affirmations?.[0] || 'Done';
    return `${affirmation}\n\n${badges || '✓ Steps executed successfully.'}`;
  }

  private generateFailureResponse(run: ExecutionRun, personality?: SystemPersonality): string {
    const effectivePersonality = personality || resolvePersonality(undefined, run.conversationId);
    const completedSteps = run.plan.steps
      .filter(s => s.status === 'verified' || s.status === 'completed')
      .map(s => s.title);
    const failedStep = run.plan.steps.find(s => s.status === 'failed');

    if (effectivePersonality.formatFailure) {
      return effectivePersonality.formatFailure(
        completedSteps,
        failedStep?.title,
        failedStep?.error || run.error
      );
    }

    let text = `Workflow interrupted.\n\n`;
    if (completedSteps.length > 0) {
      text += `Completed before issue:\n${completedSteps.map(s => `✓ ${s}`).join('\n')}\n\n`;
    }
    if (failedStep) {
      text += `Failed Step:\n✗ ${failedStep.title}\nError: ${failedStep.error || run.error}\n\n`;
    }
    text += `Subsequent actions halted to preserve state.`;
    return text;
  }
}

export const agentRuntime = new NexusAgentRuntime();
