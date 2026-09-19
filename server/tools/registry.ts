import { ActionCategory, ToolDefinition } from '../../src/types/nexus';
import { nexusStore } from '../db/store';
import { getAdapters, VerificationResult } from '../adapters';

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  search_drive: {
    name: 'search_drive',
    category: 'drive',
    actionType: 'read',
    description: 'Search files and documents matching query keywords, dates, or file extensions.',
    parameters: {
      query: { type: 'string', description: 'Search keywords or filename pattern' },
      fileType: { type: 'string', description: 'Optional extension or mime filter (e.g. "pdf", "docx")' },
    },
    requiresAuth: ['google_drive'],
    verificationStrategy: 'Verify file existence in repository and match query terms',
    isIdempotent: true,
  },
  get_file_metadata: {
    name: 'get_file_metadata',
    category: 'drive',
    actionType: 'read',
    description: 'Inspect metadata, folder path, size, and last modified date of a specific file.',
    parameters: {
      fileId: { type: 'string', description: 'File identifier or filename' },
    },
    requiresAuth: ['google_drive'],
    verificationStrategy: 'Verify file metadata from repository',
    isIdempotent: true,
  },
  read_drive_file: {
    name: 'read_drive_file',
    category: 'drive',
    actionType: 'read',
    description: 'Retrieve and extract text content from a file or document.',
    parameters: {
      fileId: { type: 'string', description: 'File identifier or filename' },
    },
    requiresAuth: ['google_drive'],
    verificationStrategy: 'Confirm readable byte stream and content extraction',
    isIdempotent: true,
  },
  move_drive_file: {
    name: 'move_drive_file',
    category: 'drive',
    actionType: 'write',
    description: 'Move a file to a designated directory or folder.',
    parameters: {
      fileId: { type: 'string', description: 'ID or name of file to move' },
      targetFolder: { type: 'string', description: 'Destination folder path' },
    },
    requiresAuth: ['google_drive'],
    verificationStrategy: 'Verify file updated in destination folder',
    isIdempotent: true,
  },
  create_drive_file: {
    name: 'create_drive_file',
    category: 'drive',
    actionType: 'write',
    description: 'Create a new document, report, or text file.',
    parameters: {
      name: { type: 'string', description: 'File name with extension' },
      content: { type: 'string', description: 'Document content' },
      folder: { type: 'string', description: 'Target folder path' },
    },
    requiresAuth: ['google_drive'],
    verificationStrategy: 'Confirm file record created with payload size',
    isIdempotent: false,
  },
  delete_drive_file: {
    name: 'delete_drive_file',
    category: 'drive',
    actionType: 'destructive',
    description: 'Permanently remove a file from storage repository.',
    parameters: {
      fileId: { type: 'string', description: 'File identifier or filename to delete' },
    },
    requiresAuth: ['google_drive'],
    verificationStrategy: 'Verify target file removed from repository index',
    isIdempotent: true,
  },
  search_emails: {
    name: 'search_emails',
    category: 'gmail',
    actionType: 'read',
    description: 'Search email inbox for messages matching query or sender.',
    parameters: {
      query: { type: 'string', description: 'Search keywords, sender, or subject' },
    },
    requiresAuth: ['gmail'],
    verificationStrategy: 'Verify matching message headers returned',
    isIdempotent: true,
  },
  read_email: {
    name: 'read_email',
    category: 'gmail',
    actionType: 'read',
    description: 'Read the full contents and body of an email message.',
    parameters: {
      messageId: { type: 'string', description: 'Message identifier' },
    },
    requiresAuth: ['gmail'],
    verificationStrategy: 'Verify message payload structure',
    isIdempotent: true,
  },
  draft_email: {
    name: 'draft_email',
    category: 'gmail',
    actionType: 'write',
    description: 'Create an email draft with recipient, subject, and body.',
    parameters: {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Draft body message' },
    },
    requiresAuth: ['gmail'],
    verificationStrategy: 'Verify draftId registered in repository',
    isIdempotent: false,
  },
  send_email: {
    name: 'send_email',
    category: 'gmail',
    actionType: 'write',
    description: 'Send an email to a recipient with idempotency deduplication.',
    parameters: {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Email body message' },
      idempotencyKey: { type: 'string', description: 'Optional unique idempotency token' },
    },
    requiresAuth: ['gmail'],
    verificationStrategy: 'Verify dispatch record and recipient address',
    isIdempotent: true,
  },
  check_calendar: {
    name: 'check_calendar',
    category: 'calendar',
    actionType: 'read',
    description: 'Inspect calendar schedule and detect unblocked free slots.',
    parameters: {
      date: { type: 'string', description: 'Target date (e.g. "tomorrow", "2026-09-18")' },
      slotDurationMinutes: { type: 'number', description: 'Desired free slot length in minutes' },
    },
    requiresAuth: ['google_calendar'],
    verificationStrategy: 'Verify scheduled commitments and computed availability gaps',
    isIdempotent: true,
  },
  create_calendar_event: {
    name: 'create_calendar_event',
    category: 'calendar',
    actionType: 'write',
    description: 'Schedule a new calendar event with time and attendees.',
    parameters: {
      title: { type: 'string', description: 'Event title' },
      start: { type: 'string', description: 'Start ISO timestamp or formatted time' },
      end: { type: 'string', description: 'End ISO timestamp or formatted time' },
      attendees: { type: 'array', description: 'List of attendee emails' },
      description: { type: 'string', description: 'Event notes or agenda' },
    },
    requiresAuth: ['google_calendar'],
    verificationStrategy: 'Verify calendar event record created in schedule',
    isIdempotent: false,
  },
  analyze_document: {
    name: 'analyze_document',
    category: 'document',
    actionType: 'read',
    description: 'Analyze document text, extract entities (monetary values, dates, IDs), or diff against another text.',
    parameters: {
      documentText: { type: 'string', description: 'Text or extracted content of the document' },
      task: { type: 'string', description: 'Analysis task (e.g. "summarize", "extract_entities", "compare")' },
      compareWithText: { type: 'string', description: 'Optional baseline text for version comparison' },
    },
    requiresAuth: [],
    verificationStrategy: 'Verify text metrics and extracted entity patterns',
    isIdempotent: true,
  },
  calculate: {
    name: 'calculate',
    category: 'document',
    actionType: 'read',
    description: 'Perform mathematical, financial, or percentage calculations with deterministic arithmetic.',
    parameters: {
      expression: { type: 'string', description: 'Mathematical expression (e.g. "45900 * 0.08", "1482900 - 45900")' },
      label: { type: 'string', description: 'Purpose or description of calculation' },
    },
    requiresAuth: [],
    verificationStrategy: 'Deterministic arithmetic evaluation',
    isIdempotent: true,
  },
  send_telegram_alert: {
    name: 'send_telegram_alert',
    category: 'notification',
    actionType: 'write',
    description: 'Dispatch an alert or notification via messaging channel.',
    parameters: {
      message: { type: 'string', description: 'Message content' },
      channel: { type: 'string', description: 'Optional channel name or handle' },
    },
    requiresAuth: ['telegram'],
    verificationStrategy: 'Confirm notification record and dispatch ID',
    isIdempotent: false,
  },
  recall_memory: {
    name: 'recall_memory',
    category: 'memory',
    actionType: 'read',
    description: 'Retrieve a stored rule, preference, or context by key.',
    parameters: {
      key: { type: 'string', description: 'Memory key to recall' },
    },
    requiresAuth: [],
    verificationStrategy: 'Verify key lookup against persistent store',
    isIdempotent: true,
  },
  update_memory: {
    name: 'update_memory',
    category: 'memory',
    actionType: 'write',
    description: 'Save an instruction, preference, or contextual record into persistent memory.',
    parameters: {
      key: { type: 'string', description: 'Memory key' },
      value: { type: 'string', description: 'Value to persist' },
    },
    requiresAuth: [],
    verificationStrategy: 'Verify key saved to persistent store',
    isIdempotent: true,
  },
};

export async function executeToolCall(
  toolName: string,
  params: Record<string, any>,
  runId: string
): Promise<{ success: boolean; data?: any; error?: string; verification?: VerificationResult }> {
  const startTime = Date.now();
  const def = TOOL_DEFINITIONS[toolName];
  if (!def) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  const adapters = getAdapters();

  try {
    let resultData: any = null;
    let verification: VerificationResult | undefined = undefined;

    switch (toolName) {
      case 'search_drive': {
        const res = await adapters.drive.searchFiles(params.query || '', params.fileType);
        resultData = {
          foundCount: res.files.length,
          files: res.files,
        };
        verification = res.verification;
        break;
      }

      case 'get_file_metadata': {
        const res = await adapters.drive.getFileMetadata(params.fileId);
        resultData = res.file;
        verification = res.verification;
        break;
      }

      case 'read_drive_file': {
        const res = await adapters.drive.readFile(params.fileId);
        resultData = {
          id: res.file.id,
          name: res.file.name,
          content: res.file.content,
          metadata: res.file.metadata,
        };
        verification = res.verification;
        break;
      }

      case 'move_drive_file': {
        const res = await adapters.drive.moveFile(params.fileId, params.targetFolder);
        resultData = res.moved;
        verification = res.verification;
        break;
      }

      case 'create_drive_file': {
        const res = await adapters.drive.createFile(params.name, params.content, params.folder);
        resultData = res.file;
        verification = res.verification;
        break;
      }

      case 'delete_drive_file': {
        const res = await adapters.drive.deleteFile(params.fileId);
        resultData = res.deleted;
        verification = res.verification;
        break;
      }

      case 'search_emails': {
        const res = await adapters.email.searchEmails(params.query || '');
        resultData = {
          count: res.emails.length,
          emails: res.emails,
        };
        verification = res.verification;
        break;
      }

      case 'read_email': {
        const res = await adapters.email.readEmail(params.messageId);
        resultData = res.email;
        verification = res.verification;
        break;
      }

      case 'draft_email': {
        const res = await adapters.email.draftEmail(params.to, params.subject, params.body);
        resultData = {
          draftId: res.draft.draftId,
          recipient: res.draft.to,
          subject: res.draft.subject,
          body: res.draft.body,
          status: 'draft_prepared',
          createdAt: res.draft.createdAt,
        };
        verification = res.verification;
        break;
      }

      case 'send_email': {
        const idKey = params.idempotencyKey || `email_${params.to}_${params.subject}`;
        const isFresh = nexusStore.checkAndSetIdempotencyKey(idKey);
        if (!isFresh) {
          return {
            success: true,
            data: {
              status: 'duplicate_prevented',
              message: 'Duplicate email dispatch prevented by idempotency guard.',
              idempotencyKey: idKey,
            },
            verification: {
              verified: true,
              isSimulated: adapters.email.mode === 'simulation',
              verificationId: `idem_${idKey}`,
              message: 'Idempotency verified: Outbound email duplicate prevented.',
              timestamp: new Date().toISOString(),
            },
          };
        }

        const res = await adapters.email.sendEmail(params.to, params.subject, params.body, idKey);
        resultData = res.sent;
        verification = res.verification;
        break;
      }

      case 'check_calendar': {
        const res = await adapters.calendar.checkCalendar(params.date, params.slotDurationMinutes);
        resultData = {
          dateChecked: res.dateChecked,
          scheduledEventsCount: res.scheduledEvents.length,
          events: res.scheduledEvents,
          availableFreeSlots: res.availableFreeSlots,
          firstFreeOneHourSlot: res.availableFreeSlots[0],
        };
        verification = res.verification;
        break;
      }

      case 'create_calendar_event': {
        const res = await adapters.calendar.createEvent(
          params.title,
          params.start,
          params.end,
          params.attendees,
          params.description
        );
        resultData = res.event;
        verification = res.verification;
        break;
      }

      case 'analyze_document': {
        const res = await adapters.document.analyze(params.documentText || '', params.task, params.compareWithText);
        resultData = res.analysis;
        verification = res.verification;
        break;
      }

      case 'calculate': {
        const res = await adapters.calculate.evaluate(params.expression, params.label);
        resultData = {
          expression: res.expression,
          result: res.result,
          formattedResult: res.formattedResult,
          label: res.label,
        };
        verification = res.verification;
        break;
      }

      case 'send_telegram_alert': {
        const res = await adapters.notification.sendAlert(params.message, params.channel);
        resultData = res;
        verification = res.verification;
        break;
      }

      case 'recall_memory': {
        const key = params.key;
        const val = nexusStore.getMemory(key);
        resultData = {
          key,
          found: !!val,
          value: val || 'No record found in memory store.',
        };
        verification = {
          verified: true,
          isSimulated: false,
          verificationId: `mem_${key}`,
          message: `Memory store queried for key: "${key}"`,
          timestamp: new Date().toISOString(),
        };
        break;
      }

      case 'update_memory': {
        const key = params.key;
        const value = params.value;
        nexusStore.setMemory(key, value, 'custom');
        resultData = { key, value, updatedAt: new Date().toISOString() };
        verification = {
          verified: true,
          isSimulated: false,
          verificationId: `mem_set_${key}`,
          message: `Memory store persisted: "${key}" = "${value}"`,
          timestamp: new Date().toISOString(),
        };
        break;
      }

      default:
        throw new Error(`Handler not configured for tool: ${toolName}`);
    }

    const duration = Date.now() - startTime;
    nexusStore.logToolCall({
      id: `call_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`,
      runId,
      tool: toolName,
      actionType: def.actionType,
      parameters: params,
      result: resultData,
      status: 'success',
      isSimulated: verification?.isSimulated ?? false,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      data: resultData,
      verification,
    };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    nexusStore.logToolCall({
      id: `call_err_${Date.now().toString(36)}`,
      runId,
      tool: toolName,
      actionType: def.actionType,
      parameters: params,
      result: null,
      status: 'failed',
      error: err.message,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      error: err.message,
    };
  }
}
