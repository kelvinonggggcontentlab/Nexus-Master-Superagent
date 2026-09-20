import { GoogleGenAI, Type } from '@google/genai';
import { ExecutionPlan, TaskStep } from '../../src/types/nexus';
import { TOOL_DEFINITIONS } from '../tools/registry';
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

// Top-level helper extraction routines
export const extractEmail = (text: string): string => {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (match) return match[0];
  const nameMatch = text.match(/(?:email|send to|to)\s+([A-Za-z]+)/i);
  if (nameMatch) {
    const name = nameMatch[1].toLowerCase();
    return `${name}@example.com`;
  }
  return 'operator@example.com';
};

export const extractSearchTerm = (text: string, fallback: string): string => {
  if (text.includes('invoice')) return 'invoice';
  if (text.includes('statement')) return 'statement';
  if (text.includes('masterplan')) return 'masterplan';
  if (text.includes('roadmap')) return 'roadmap';
  if (text.includes('contract')) return 'contract';
  if (text.includes('report')) return 'report';
  const forMatch = text.match(
    /(?:find|search for|locate|get)\s+(?:the\s+)?([A-Za-z0-9_\-.\s]{3,30}?)(?:\s+(?:from|in|and|then|$))/i
  );
  if (forMatch && forMatch[1].trim()) {
    return forMatch[1].trim();
  }
  return fallback;
};

export const extractFolder = (text: string): string => {
  const match = text.match(/(?:\/|to\s+)([A-Za-z0-9_\-/]+)/i);
  if (match && match[1].includes('/')) {
    return match[1].startsWith('/') ? match[1] : `/${match[1]}`;
  }
  return '/Finance/Archive/2026';
};

export async function createExecutionPlan(
  userPrompt: string,
  conversationId: string,
  assembledContext?: AssembledContext,
  personality?: SystemPersonality | string
): Promise<ExecutionPlan> {
  const context = assembledContext || contextEngine.assembleContext(userPrompt, conversationId);
  const effectivePersonality = resolvePersonality(personality || context.personality, conversationId);
  if (!context.personality) {
    context.personality = effectivePersonality;
  }

  // 1. If user requested cancellation
  if (context.intent === 'CANCEL_TASK') {
    const planId = `plan_cancel_${Date.now().toString(36)}`;
    const cancelRes = contextEngine.cancelActiveTask(conversationId, 'User requested cancellation');
    return {
      id: planId,
      userGoal: userPrompt,
      intent: 'Cancel active task and preserve state',
      requiresConfirmation: false,
      steps: [],
      estimatedTools: [],
    };
  }

  // 2. If reference is ambiguous and requires clarification
  if (context.intent === 'CLARIFY') {
    const planId = `plan_clarify_${Date.now().toString(36)}`;
    return {
      id: planId,
      userGoal: userPrompt,
      intent: 'Request clarification on ambiguous reference',
      requiresConfirmation: false,
      steps: [],
      estimatedTools: [],
    };
  }

  // 3. If user is modifying existing active task parameters
  if (context.intent === 'MODIFY_TASK') {
    contextEngine.modifyActiveTask(conversationId, context.modifiedParameters || {}, userPrompt);
    const planId = `plan_mod_${Date.now().toString(36)}`;
    return {
      id: planId,
      userGoal: userPrompt,
      intent: 'Apply modification to active task',
      requiresConfirmation: false,
      steps: [],
      estimatedTools: [],
    };
  }

  // 4. If user is querying existing verified results
  if (context.intent === 'QUERY_RESULT') {
    const planId = `plan_query_${Date.now().toString(36)}`;
    return {
      id: planId,
      userGoal: userPrompt,
      intent: 'Answer query directly from verified context',
      requiresConfirmation: false,
      steps: [],
      estimatedTools: [],
    };
  }

  // 3. Try Gemini planning with full context and dynamic personality
  const ai = getGemini();
  if (ai && !isGeminiQuotaExhausted()) {
    try {
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini planning timed out')), 2500)
      );
      const plan = await Promise.race([
        generateGeminiPlan(ai, userPrompt, conversationId, context, effectivePersonality),
        timeoutPromise,
      ]);
      if (plan && plan.steps.length > 0) {
        return plan;
      }
    } catch (err: any) {
      if (isQuotaOrRateLimitError(err)) {
        markQuotaExhausted(60000);
      } else {
        console.info('Using deterministic planner fallback:', err?.message || 'timeout');
      }
    }
  }

  // 4. Deterministic Contextual Planning
  return buildDeterministicPlan(userPrompt, context, effectivePersonality);
}

async function generateGeminiPlan(
  ai: GoogleGenAI,
  userPrompt: string,
  conversationId: string,
  context: AssembledContext,
  personality: SystemPersonality
): Promise<ExecutionPlan | null> {
  const toolsSchema = Object.values(TOOL_DEFINITIONS).map(t => ({
    name: t.name,
    category: t.category,
    actionType: t.actionType,
    description: t.description,
    parameters: t.parameters,
  }));

  const systemInstruction = `You are the master planner for NEXUS SUPERAGENT.
Your role is to decompose the user's natural language goal into a strictly ordered, verified multi-step execution plan using the provided tool definitions and context.

${personality.buildPromptSection('planner')}

Active Context:
Intent: ${context.intent}
Resolved References: ${JSON.stringify(context.resolvedReferences, null, 2)}
Active Task: ${context.activeTask ? JSON.stringify({ id: context.activeTask.taskId, objective: context.activeTask.currentObjective }, null, 2) : 'none'}
Relevant Entities: ${JSON.stringify(context.relevantEntities.map(e => ({ type: e.type, id: e.identifier, label: e.label })), null, 2)}

Available Tools:
${JSON.stringify(toolsSchema, null, 2)}

Rules:
1. If the user refers to "it", "that", "the file", "the invoice", REUSE the resolved references or active task entity. DO NOT re-search if the resource is already in context. When using read_drive_file, always pass the exact fileId from Resolved References target_file.identifier (e.g. parameters: { "fileId": context.resolvedReferences.target_file.identifier }).
2. If the user says "prepare an email" or "draft an email" with that summary, use a SINGLE step with tool "draft_email" reusing the summary from context. DO NOT re-search Drive, DO NOT re-read the file, and DO NOT call analyze_document again if the summary already exists in context!
3. If they say "send it", use "send_email".
4. Any destructive actions (delete_drive_file) MUST have actionType='destructive', requiresConfirmation=true, and a clear confirmationReason.
5. Express step dependencies clearly using step IDs (e.g. 'step_1', 'step_2').
6. Keep execution steps strictly factual and verified.`;

  let response: any = null;
  const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-flash-latest'];

  for (const model of modelsToTry) {
    try {
      response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: { type: Type.STRING },
              requiresConfirmation: { type: Type.BOOLEAN },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    stepNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    tool: { type: Type.STRING },
                    parameters: { type: Type.OBJECT },
                    actionType: { type: Type.STRING, enum: ['read', 'write', 'destructive'] },
                    requiresConfirmation: { type: Type.BOOLEAN },
                    confirmationReason: { type: Type.STRING },
                    dependencies: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['stepNumber', 'title', 'description', 'tool', 'actionType', 'dependencies'],
                },
              },
            },
            required: ['intent', 'steps'],
          },
        },
      });
      if (response?.text) break;
    } catch (err: any) {
      if (isQuotaOrRateLimitError(err)) {
        markQuotaExhausted(60000);
        return null;
      }
    }
  }

  if (!response?.text) return null;
  const raw = JSON.parse(response.text);
  const planId = `plan_${Date.now().toString(36)}`;

  const steps: TaskStep[] = (raw.steps || []).map((s: any, idx: number) => {
    let params = s.parameters || {};
    if (typeof params === 'string') {
      try {
        params = JSON.parse(params);
      } catch {
        params = {};
      }
    }
    // Fallback for calculate tool if expression was omitted in parameters
    if (s.tool === 'calculate' && (!params.expression || params.expression === 'undefined')) {
      const match = (userPrompt + ' ' + (s.description || '')).match(/(\d+(?:\.\d+)?(?:\s*[\+\-\*\/\%]\s*\d+(?:\.\d+)?)+)/);
      if (match) {
        params.expression = match[1].trim();
      }
    }

    // Fallback for search_drive tool if query was omitted
    if (s.tool === 'search_drive' && (!params.query || params.query === 'undefined' || params.query === '')) {
      params.query = extractSearchTerm(userPrompt.toLowerCase(), 'invoice');
    }

    // Fallback for read_drive_file tool if fileId was omitted
    if (s.tool === 'read_drive_file' && (!params.fileId || params.fileId === 'undefined' || params.fileId === 'auto')) {
      const resolvedFileId =
        context.resolvedReferences?.target_file?.identifier ||
        context.activeTask?.toolResults?.search_drive?.files?.[0]?.id ||
        context.relevantEntities.find(e => e.type === 'file')?.identifier;
      if (resolvedFileId) {
        params.fileId = resolvedFileId;
      }
    }

    // Fallback for draft_email / send_email if to was omitted
    if ((s.tool === 'draft_email' || s.tool === 'send_email') && (!params.to || params.to === 'undefined')) {
      params.to = extractEmail(userPrompt);
    }

    // Fallback for draft_email body with summary from context
    if (s.tool === 'draft_email' && (!params.body || params.body === 'undefined' || params.body === '')) {
      const summary =
        context.resolvedReferences?.summary?.label ||
        context.activeTask?.toolResults?.analyze_document?.summaryLines?.join('\n') ||
        'Verified document summary';
      params.body = summary;
      if (!params.subject) params.subject = 'Document Summary';
    }

    return {
      id: `step_${planId}_${s.stepNumber || idx + 1}`,
      taskId: planId,
      stepNumber: s.stepNumber || idx + 1,
      title: s.title,
      description: s.description,
      tool: s.tool,
      parameters: params,
      actionType: s.actionType || 'read',
      requiresConfirmation: !!s.requiresConfirmation,
      confirmationReason: s.confirmationReason,
      status: 'pending',
      dependencies: (s.dependencies || []).map((d: string) => {
        if (d.startsWith(`step_${planId}_`)) return d;
        const numMatch = d.match(/(\d+)$/);
        if (numMatch) {
          return `step_${planId}_${numMatch[1]}`;
        }
        return `step_${planId}_${d}`;
      }),
    };
  });

  const estimatedTools = Array.from(new Set(steps.map(s => s.tool)));

  return {
    id: planId,
    userGoal: userPrompt,
    intent: raw.intent || 'Execute autonomous workflow',
    requiresConfirmation: steps.some(s => s.requiresConfirmation),
    steps,
    estimatedTools,
  };
}

export function buildDeterministicPlan(
  userPrompt: string,
  context?: AssembledContext,
  personality?: SystemPersonality | string
): ExecutionPlan {
  const effectivePersonality = resolvePersonality(personality || context?.personality);
  const planId = `plan_${Date.now().toString(36)}`;
  const lower = userPrompt.toLowerCase();
  const steps: TaskStep[] = [];

  // Check resolved references from context
  const resolvedTargetFile = context?.resolvedReferences?.target_file;
  const resolvedSummary = context?.resolvedReferences?.summary;
  const activeTask = context?.activeTask;

  // -------------------------------------------------------------
  // CONTEXT CONTINUATIONS
  // -------------------------------------------------------------

  // A. "Summarize it" / "Summarize the file" (Reusing existing file from context without re-searching!)
  if (
    (lower === 'summarize it' || lower.startsWith('summarize')) &&
    (resolvedTargetFile || (activeTask && activeTask.toolResults?.search_drive?.files?.[0]))
  ) {
    const fileId =
      resolvedTargetFile?.identifier ||
      activeTask?.toolResults?.search_drive?.files?.[0]?.id ||
      'auto';
    const fileName =
      resolvedTargetFile?.label ||
      activeTask?.toolResults?.search_drive?.files?.[0]?.name ||
      'Document';

    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: `Extract Content from "${fileName}"`,
      description: 'Read file text stream using resolved reference',
      tool: 'read_drive_file',
      parameters: { fileId },
      actionType: 'read',
      status: 'pending',
      dependencies: [],
    });

    steps.push({
      id: `step_${planId}_2`,
      taskId: planId,
      stepNumber: 2,
      title: `Analyze & Summarize "${fileName}"`,
      description: 'Extract key figures, dates, and executive highlights',
      tool: 'analyze_document',
      parameters: { task: 'summarize', documentText: 'auto' },
      actionType: 'read',
      status: 'pending',
      dependencies: [`step_${planId}_1`],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Summarize contextually referenced document (${fileName})`,
      requiresConfirmation: false,
      steps,
      estimatedTools: ['read_drive_file', 'analyze_document'],
    };
  }

  // B. "Prepare an email with that summary" / "Draft email with summary"
  // (Prepares or drafts email without sending, reusing existing summary)
  if (
    lower.includes('prepare an email') ||
    lower.includes('draft an email') ||
    lower.includes('prepare email') ||
    lower.includes('draft email')
  ) {
    const recipient = extractEmail(userPrompt);
    const hasExistingSummary =
      resolvedSummary || activeTask?.toolResults?.analyze_document?.summaryLines;

    let summaryBody = '{{summary}}';
    if (activeTask?.toolResults?.analyze_document?.summaryLines) {
      summaryBody = activeTask.toolResults.analyze_document.summaryLines.join('\n');
    }

    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: `Draft Email Summary to ${recipient}`,
      description: 'Prepare email draft containing verified document summary',
      tool: 'draft_email',
      parameters: {
        to: recipient,
        subject: 'Document Summary',
        body: summaryBody,
      },
      actionType: 'write',
      status: 'pending',
      dependencies: [],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Prepare draft email to ${recipient} with verified summary`,
      requiresConfirmation: false,
      steps,
      estimatedTools: ['draft_email'],
    };
  }

  // C. "Email that to <recipient>" / "Send that summary to <recipient>"
  if (
    (lower.startsWith('email that') || lower.startsWith('send that') || (lower.includes('email') && lower.includes('summary'))) &&
    activeTask
  ) {
    const recipient = extractEmail(userPrompt);
    let summaryBody = '{{summary}}';
    if (activeTask?.toolResults?.analyze_document?.summaryLines) {
      summaryBody = activeTask.toolResults.analyze_document.summaryLines.join('\n');
    }

    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: `Dispatch Summary to ${recipient}`,
      description: 'Send authenticated email with extracted summary highlights',
      tool: 'send_email',
      parameters: {
        to: recipient,
        subject: 'Document Summary Notification',
        body: summaryBody,
        idempotencyKey: `mail_${planId}`,
      },
      actionType: 'write',
      status: 'pending',
      dependencies: [],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Dispatch verified summary to ${recipient}`,
      requiresConfirmation: false,
      steps,
      estimatedTools: ['send_email'],
    };
  }

  // -------------------------------------------------------------
  // AUTONOMOUS MULTI-STEP WORKFLOWS
  // -------------------------------------------------------------

  // 0. Pipeline: "Find invoice/file, summarize it, and save the summary next to the original"
  if (
    (lower.includes('find') || lower.includes('search') || lower.includes('get') || lower.includes('locate')) &&
    (lower.includes('summarize') || lower.includes('summary')) &&
    (lower.includes('save') || lower.includes('store') || lower.includes('write')) &&
    (lower.includes('next to') || lower.includes('alongside') || lower.includes('to drive') || lower.includes('same folder'))
  ) {
    const term = extractSearchTerm(lower, 'invoice');

    // Step 1: Search Gmail or Drive for the invoice
    const isGmailSource = lower.includes('gmail') || lower.includes('email') || lower.includes('inbox');
    if (isGmailSource) {
      steps.push({
        id: `step_${planId}_1`,
        taskId: planId,
        stepNumber: 1,
        title: `Search Gmail Inbox for "${term}"`,
        description: `Locate matching email invoice in mailbox`,
        tool: 'search_emails',
        parameters: { query: term },
        actionType: 'read',
        status: 'pending',
        dependencies: [],
      });
      steps.push({
        id: `step_${planId}_2`,
        taskId: planId,
        stepNumber: 2,
        title: 'Extract Invoice Document Content',
        description: 'Read email body or retrieve file text stream',
        tool: 'read_drive_file',
        parameters: { fileId: 'auto' },
        actionType: 'read',
        status: 'pending',
        dependencies: [`step_${planId}_1`],
      });
    } else {
      steps.push({
        id: `step_${planId}_1`,
        taskId: planId,
        stepNumber: 1,
        title: `Search Drive for "${term}"`,
        description: `Locate matching file in Google Drive repository`,
        tool: 'search_drive',
        parameters: { query: term },
        actionType: 'read',
        status: 'pending',
        dependencies: [],
      });
      steps.push({
        id: `step_${planId}_2`,
        taskId: planId,
        stepNumber: 2,
        title: 'Extract Document Content',
        description: 'Read file text stream from Drive storage',
        tool: 'read_drive_file',
        parameters: { fileId: 'auto' },
        actionType: 'read',
        status: 'pending',
        dependencies: [`step_${planId}_1`],
      });
    }

    // Step 3: Analyze & Summarize Document
    steps.push({
      id: `step_${planId}_3`,
      taskId: planId,
      stepNumber: 3,
      title: 'Analyze & Summarize Document',
      description: 'Extract key figures, dates, and executive highlights',
      tool: 'analyze_document',
      parameters: { task: 'summarize', documentText: 'auto' },
      actionType: 'read',
      status: 'pending',
      dependencies: [`step_${planId}_2`],
    });

    // Step 4: Save Summary Next to Original in Drive
    steps.push({
      id: `step_${planId}_4`,
      taskId: planId,
      stepNumber: 4,
      title: `Save Summary Alongside Original in Drive`,
      description: 'Create summary document in same directory next to original file',
      tool: 'create_drive_file',
      parameters: {
        name: `${term.replace(/\s+/g, '_')}_Summary.txt`,
        content: 'auto',
        folder: 'auto',
      },
      actionType: 'write',
      status: 'pending',
      dependencies: [`step_${planId}_3`],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Find ${term}, summarize it, and save summary next to original in Drive`,
      requiresConfirmation: false,
      steps,
      estimatedTools: isGmailSource
        ? ['search_emails', 'read_drive_file', 'analyze_document', 'create_drive_file']
        : ['search_drive', 'read_drive_file', 'analyze_document', 'create_drive_file'],
    };
  }

  // 1. Pipeline: Find file + summarize/read + email
  if (
    (lower.includes('find') || lower.includes('search') || lower.includes('get')) &&
    (lower.includes('email') || lower.includes('send') || lower.includes('mail')) &&
    (lower.includes('drive') || lower.includes('invoice') || lower.includes('statement') || lower.includes('document'))
  ) {
    const term = extractSearchTerm(lower, 'invoice');
    const recipient = extractEmail(userPrompt);

    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: `Search Drive for "${term}"`,
      description: `Locate matching file in Google Drive repository`,
      tool: 'search_drive',
      parameters: { query: term },
      actionType: 'read',
      status: 'pending',
      dependencies: [],
    });

    steps.push({
      id: `step_${planId}_2`,
      taskId: planId,
      stepNumber: 2,
      title: 'Extract Document Content',
      description: 'Read file text stream from Drive storage',
      tool: 'read_drive_file',
      parameters: { fileId: 'auto' },
      actionType: 'read',
      status: 'pending',
      dependencies: [`step_${planId}_1`],
    });

    steps.push({
      id: `step_${planId}_3`,
      taskId: planId,
      stepNumber: 3,
      title: 'Analyze & Summarize Document',
      description: 'Extract key figures, dates, and executive highlights',
      tool: 'analyze_document',
      parameters: { task: 'summarize', documentText: 'auto' },
      actionType: 'read',
      status: 'pending',
      dependencies: [`step_${planId}_2`],
    });

    steps.push({
      id: `step_${planId}_4`,
      taskId: planId,
      stepNumber: 4,
      title: `Dispatch Summary to ${recipient}`,
      description: 'Send authenticated email with extracted summary highlights',
      tool: 'send_email',
      parameters: {
        to: recipient,
        subject: `Document Summary: ${term.toUpperCase()}`,
        body: `Dear Recipient,\n\nPlease find the summary of the requested document (${term}):\n\n{{summary}}\n\nVerified by NEXUS SUPERAGENT.`,
        idempotencyKey: `mail_${planId}`,
      },
      actionType: 'write',
      status: 'pending',
      dependencies: [`step_${planId}_3`],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Locate ${term}, extract summary, and email to ${recipient}`,
      requiresConfirmation: false,
      steps,
      estimatedTools: ['search_drive', 'read_drive_file', 'analyze_document', 'send_email'],
    };
  }

  // 2. Calendar Booking & Inspection
  const isBooking =
    lower.includes('book') ||
    lower.includes('schedule meeting') ||
    lower.includes('set up meeting');
  const isCheckingCalendar =
    lower.includes('calendar') ||
    lower.includes('free slot') ||
    lower.includes('availability') ||
    lower.includes('schedule tomorrow');

  if (isBooking) {
    let meetingTitle = 'Roadmap Review';
    const titleMatch = userPrompt.match(
      /(?:for|titled|about)\s+([A-Za-z0-9\s]{3,30}?)(?:\s+(?:at|with|tomorrow|$))/i
    );
    if (titleMatch) meetingTitle = titleMatch[1].trim();

    const attendee = extractEmail(userPrompt);

    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: 'Inspect Calendar for Free Slots',
      description: 'Scan Google Calendar schedule to locate 1-hour unblocked availability',
      tool: 'check_calendar',
      parameters: { date: 'tomorrow', slotDurationMinutes: 60 },
      actionType: 'read',
      status: 'pending',
      dependencies: [],
    });

    steps.push({
      id: `step_${planId}_2`,
      taskId: planId,
      stepNumber: 2,
      title: `Schedule "${meetingTitle}"`,
      description: `Create calendar event with attendees`,
      tool: 'create_calendar_event',
      parameters: {
        title: meetingTitle,
        start: 'TBD',
        end: 'TBD',
        attendees: [attendee],
        description: `Scheduled by NEXUS: ${meetingTitle}`,
      },
      actionType: 'write',
      status: 'pending',
      dependencies: [`step_${planId}_1`],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Scan calendar and schedule "${meetingTitle}"`,
      requiresConfirmation: false,
      steps,
      estimatedTools: ['check_calendar', 'create_calendar_event'],
    };
  }

  if (isCheckingCalendar) {
    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: 'Scan Calendar Availability',
      description: 'Retrieve schedule commitments and calculate open windows',
      tool: 'check_calendar',
      parameters: { date: 'tomorrow', slotDurationMinutes: 60 },
      actionType: 'read',
      status: 'pending',
      dependencies: [],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: 'Inspect schedule availability and open windows',
      requiresConfirmation: false,
      steps,
      estimatedTools: ['check_calendar'],
    };
  }

  // 3. Mathematical / Tax / Financial Calculation
  if (
    lower.includes('calculate') ||
    lower.includes('tax') ||
    lower.includes('sst') ||
    lower.includes('%') ||
    lower.includes('multiply') ||
    lower.includes('sum') ||
    lower.includes('balance')
  ) {
    let expr = '45900 * 0.08';
    const pctMatch = userPrompt.match(
      /(\d+(?:\.\d+)?)\s*%\s*(?:[a-zA-Z\s]{0,35}?)?(?:tax|on|of)?\s*(?:MYR|USD|\$)?\s*([\d,]+(?:\.\d+)?)/i
    );
    if (pctMatch) {
      const pct = parseFloat(pctMatch[1]) / 100;
      const base = pctMatch[2].replace(/,/g, '');
      expr = `${base} * ${pct}`;
    } else {
      const mathMatch = userPrompt.match(/([\d,]+(?:\.\d+)?)\s*([*+\-/x])\s*([\d,]+(?:\.\d+)?)/i);
      if (mathMatch) {
        const left = mathMatch[1].replace(/,/g, '');
        const op = mathMatch[2].toLowerCase() === 'x' ? '*' : mathMatch[2];
        const right = mathMatch[3].replace(/,/g, '');
        expr = `${left} ${op} ${right}`;
      }
    }

    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: 'Compute Formula Determinstically',
      description: `Evaluate mathematical expression (${expr})`,
      tool: 'calculate',
      parameters: { expression: expr, label: 'Financial Computation' },
      actionType: 'read',
      status: 'pending',
      dependencies: [],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Compute ${expr} with arithmetic verification`,
      requiresConfirmation: false,
      steps,
      estimatedTools: ['calculate'],
    };
  }

  // 4. File Move / Reorganization
  if (lower.includes('move') || lower.includes('relocate') || lower.includes('organize')) {
    const term = extractSearchTerm(lower, 'invoice');
    const targetFolder = extractFolder(userPrompt);

    // If target file already resolved in context, skip search!
    if (resolvedTargetFile) {
      steps.push({
        id: `step_${planId}_1`,
        taskId: planId,
        stepNumber: 1,
        title: `Move "${resolvedTargetFile.label}" to ${targetFolder}`,
        description: `Relocate referenced file to destination folder`,
        tool: 'move_drive_file',
        parameters: { fileId: resolvedTargetFile.identifier, targetFolder },
        actionType: 'write',
        status: 'pending',
        dependencies: [],
      });

      return {
        id: planId,
        userGoal: userPrompt,
        intent: `Relocate referenced file to ${targetFolder}`,
        requiresConfirmation: false,
        steps,
        estimatedTools: ['move_drive_file'],
      };
    }

    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: `Locate File "${term}" in Drive`,
      description: 'Find file record in storage index',
      tool: 'search_drive',
      parameters: { query: term },
      actionType: 'read',
      status: 'pending',
      dependencies: [],
    });

    steps.push({
      id: `step_${planId}_2`,
      taskId: planId,
      stepNumber: 2,
      title: `Move File to ${targetFolder}`,
      description: `Relocate file to destination folder`,
      tool: 'move_drive_file',
      parameters: { fileId: 'auto', targetFolder },
      actionType: 'write',
      status: 'pending',
      dependencies: [`step_${planId}_1`],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Relocate "${term}" to ${targetFolder}`,
      requiresConfirmation: false,
      steps,
      estimatedTools: ['search_drive', 'move_drive_file'],
    };
  }

  // 5. Destructive: File Deletion (Requires User Confirmation)
  if (lower.includes('delete') || lower.includes('purge') || lower.includes('remove file')) {
    const term = extractSearchTerm(lower, 'invoice');

    // If target file already resolved in context, directly target it!
    if (resolvedTargetFile) {
      steps.push({
        id: `step_${planId}_1`,
        taskId: planId,
        stepNumber: 1,
        title: `Permanently Delete "${resolvedTargetFile.label}"`,
        description: 'Remove referenced file permanently from storage',
        tool: 'delete_drive_file',
        parameters: { fileId: resolvedTargetFile.identifier },
        actionType: 'destructive',
        requiresConfirmation: true,
        confirmationReason: `Permanent deletion of ${resolvedTargetFile.label} cannot be reversed. Explicit authorization required.`,
        status: 'pending',
        dependencies: [],
      });

      return {
        id: planId,
        userGoal: userPrompt,
        intent: `Permanently delete referenced "${resolvedTargetFile.label}"`,
        requiresConfirmation: true,
        steps,
        estimatedTools: ['delete_drive_file'],
      };
    }

    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: `Locate File "${term}" for Deletion`,
      description: 'Confirm file exists before executing destructive action safeguard',
      tool: 'search_drive',
      parameters: { query: term },
      actionType: 'read',
      status: 'pending',
      dependencies: [],
    });

    steps.push({
      id: `step_${planId}_2`,
      taskId: planId,
      stepNumber: 2,
      title: 'Permanently Delete Drive File',
      description: 'Remove file permanently from storage',
      tool: 'delete_drive_file',
      parameters: { fileId: 'auto' },
      actionType: 'destructive',
      requiresConfirmation: true,
      confirmationReason:
        'Permanent file deletion cannot be reversed. Explicit authorization required.',
      status: 'pending',
      dependencies: [`step_${planId}_1`],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Locate and permanently delete "${term}"`,
      requiresConfirmation: true,
      steps,
      estimatedTools: ['search_drive', 'delete_drive_file'],
    };
  }

  // 6. Document Comparison / Diff
  if (lower.includes('compare') || lower.includes('diff') || lower.includes('version')) {
    const term = extractSearchTerm(lower, 'Masterplan');

    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: `Search Drive for "${term}" Versions`,
      description: 'Locate documents matching version comparison criteria',
      tool: 'search_drive',
      parameters: { query: term },
      actionType: 'read',
      status: 'pending',
      dependencies: [],
    });

    steps.push({
      id: `step_${planId}_2`,
      taskId: planId,
      stepNumber: 2,
      title: 'Extract Baseline Document',
      description: 'Read primary document content',
      tool: 'read_drive_file',
      parameters: { fileId: 'auto' },
      actionType: 'read',
      status: 'pending',
      dependencies: [`step_${planId}_1`],
    });

    steps.push({
      id: `step_${planId}_3`,
      taskId: planId,
      stepNumber: 3,
      title: 'Execute Content Diff & Analysis',
      description: 'Compare textual deltas and analyze revision differences',
      tool: 'analyze_document',
      parameters: { task: 'diff', documentText: 'auto' },
      actionType: 'read',
      status: 'pending',
      dependencies: [`step_${planId}_2`],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Compare versions of "${term}"`,
      requiresConfirmation: false,
      steps,
      estimatedTools: ['search_drive', 'read_drive_file', 'analyze_document'],
    };
  }

  // 7. Memory Recall / Store
  if (
    lower.includes('remember') ||
    lower.includes('save rule') ||
    lower.includes('save preference')
  ) {
    const keyMatch = userPrompt.match(/(?:key|rule|preference)\s*(?:[:=]|for)?\s*([A-Za-z0-9_]+)/i);
    const key = keyMatch ? keyMatch[1] : 'user_preference';

    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: `Persist Rule in Memory (${key})`,
      description: 'Store contextual preference into long-term memory store',
      tool: 'update_memory',
      parameters: { key, value: userPrompt },
      actionType: 'write',
      status: 'pending',
      dependencies: [],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Persist "${key}" into memory`,
      requiresConfirmation: false,
      steps,
      estimatedTools: ['update_memory'],
    };
  }

  if (lower.includes('recall') || lower.includes('what is') || lower.includes('who is')) {
    const keyMatch = userPrompt.match(/(?:recall|what is|who is)\s+([A-Za-z0-9_]+)/i);
    const key = keyMatch ? keyMatch[1] : 'organization';

    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: `Recall Context from Memory (${key})`,
      description: 'Query persistent memory store for key',
      tool: 'recall_memory',
      parameters: { key },
      actionType: 'read',
      status: 'pending',
      dependencies: [],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Retrieve "${key}" from memory`,
      requiresConfirmation: false,
      steps,
      estimatedTools: ['recall_memory'],
    };
  }

  // 8. Standalone Email Send
  if (
    lower.includes('send email') ||
    lower.includes('write email') ||
    lower.includes('email to')
  ) {
    const recipient = extractEmail(userPrompt);

    steps.push({
      id: `step_${planId}_1`,
      taskId: planId,
      stepNumber: 1,
      title: `Dispatch Email to ${recipient}`,
      description: 'Send authenticated email message with idempotency tracking',
      tool: 'send_email',
      parameters: {
        to: recipient,
        subject: 'Notification from NEXUS SUPERAGENT',
        body: `Hello,\n\nThis message was dispatched in response to: "${userPrompt}".\n\nVerified by NEXUS.`,
        idempotencyKey: `mail_${planId}`,
      },
      actionType: 'write',
      status: 'pending',
      dependencies: [],
    });

    return {
      id: planId,
      userGoal: userPrompt,
      intent: `Dispatch email to ${recipient}`,
      requiresConfirmation: false,
      steps,
      estimatedTools: ['send_email'],
    };
  }

  // 9. Standalone Search in Drive (Default fallback)
  const query = extractSearchTerm(lower, 'document');
  steps.push({
    id: `step_${planId}_1`,
    taskId: planId,
    stepNumber: 1,
    title: `Search Drive for "${query}"`,
    description: 'Scan files matching keywords in Drive storage',
    tool: 'search_drive',
    parameters: { query },
    actionType: 'read',
    status: 'pending',
    dependencies: [],
  });

  return {
    id: planId,
    userGoal: userPrompt,
    intent: `Search storage for "${query}"`,
    requiresConfirmation: false,
    steps,
    estimatedTools: ['search_drive'],
  };
}
