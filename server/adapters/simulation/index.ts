import {
  ActionCategory,
  ExecutionMode,
  VerificationResult,
  WorkspaceFileItem,
  WorkspaceEmailItem,
  WorkspaceCalendarEventItem,
  IDriveAdapter,
  IEmailAdapter,
  ICalendarAdapter,
  IDocumentAnalysisAdapter,
  ICalculationAdapter,
  INotificationAdapter,
  AdapterBundle,
} from '../types';

export class SimulationDriveAdapter implements IDriveAdapter {
  public readonly mode: ExecutionMode = 'simulation';
  private files: WorkspaceFileItem[] = [];

  constructor(initialFiles?: WorkspaceFileItem[]) {
    this.files = initialFiles ? [...initialFiles] : this.getDefaultFiles();
  }

  public reset(customFiles?: WorkspaceFileItem[]) {
    this.files = customFiles ? [...customFiles] : this.getDefaultFiles();
  }

  private getDefaultFiles(): WorkspaceFileItem[] {
    return [
      {
        id: 'file_inv_101',
        name: 'Maybank_Invoice_INV-2026-8812.pdf',
        mimeType: 'application/pdf',
        folder: '/Finance/Invoices/2026',
        sizeBytes: 248102,
        modifiedAt: '2026-09-15T14:32:00Z',
        content: `MAYBANK ISLAMIC BERHAD (Co. No. 787435-M)
BILLING STATEMENT & TAX INVOICE
Invoice No: INV-2026-8812
Date: 15 September 2026
Account: BLACKTOWER HOLDINGS (Acc: 5140-1288-9901)
Service Description: Commercial Cloud & Enterprise Data Highway Settlement - Q3 2026
Subtotal: MYR 42,500.00
Service Tax (8%): MYR 3,400.00
Total Amount Payable: MYR 45,900.00
Payment Due Date: 30 September 2026
Bank Ref: MBB-MY-202609-8812`,
        metadata: {
          vendor: 'Maybank Islamic Berhad',
          invoiceNumber: 'INV-2026-8812',
          total: 'MYR 45,900.00',
          dueDate: '30 September 2026',
        },
      },
      {
        id: 'file_stmt_102',
        name: 'Maybank_Statement_August_2026.pdf',
        mimeType: 'application/pdf',
        folder: '/Finance/Statements',
        sizeBytes: 312400,
        modifiedAt: '2026-09-01T09:15:00Z',
        content: `Monthly Financial Statement - August 2026
Account: BLACKTOWER ENTERPRISE (Acc: 5140-1288-9901)
Closing Balance: MYR 1,482,900.00
Total Credits: MYR 320,000.00
Total Debits: MYR 145,200.00`,
        metadata: {
          vendor: 'Maybank',
          period: 'August 2026',
        },
      },
      {
        id: 'file_doc_201',
        name: 'Strategic_Masterplan_2026_v2.1.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        folder: '/Executive/Strategy',
        sizeBytes: 520440,
        modifiedAt: '2026-09-16T18:00:00Z',
        content: `STRATEGIC MASTERPLAN 2026 (Revision 2.1)
Scope: Autonomous AI Operating Layer rollout across Southeast Asia & Global Hubs.
Updates: Added NEXUS Master Superagent operational deployment, zero-compromise security enclave, and persistent multi-tenant architecture. Target Q4 launch date.`,
        metadata: {
          version: 'v2.1',
          status: 'Active Final',
        },
      },
      {
        id: 'file_doc_202',
        name: 'Strategic_Masterplan_2026_v1.0.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        folder: '/Executive/Strategy/Archive',
        sizeBytes: 480110,
        modifiedAt: '2026-08-10T11:20:00Z',
        content: `STRATEGIC MASTERPLAN 2026 (Revision 1.0)
Preliminary roadmap for intelligent infrastructure and data telemetry.`,
        metadata: {
          version: 'v1.0',
          status: 'Archived',
        },
      },
    ];
  }

  public async searchFiles(query: string, fileType?: string): Promise<{
    files: Array<Omit<WorkspaceFileItem, 'content'>>;
    verification: VerificationResult;
  }> {
    const q = (query || '').toLowerCase().trim();
    const cleanQ = q.replace(/[^a-z0-9\s_-]/gi, ' ').trim();
    let matches = this.files.filter(f => {
      const matchText = f.name.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(cleanQ) ||
        f.folder.toLowerCase().includes(q) ||
        f.content.toLowerCase().includes(q);
      const matchType = fileType ? f.name.toLowerCase().endsWith(fileType.toLowerCase()) : true;
      return matchText && matchType;
    });

    if (matches.length === 0 && cleanQ.length > 2) {
      const tokens = cleanQ.split(/\s+/).filter(t => t.length > 2);
      matches = this.files.filter(f =>
        tokens.some(t => f.name.toLowerCase().includes(t) || f.content.toLowerCase().includes(t))
      );
    }

    const verification: VerificationResult = {
      verified: true,
      isSimulated: true,
      verificationId: `sim_drive_v_${Date.now().toString(36)}`,
      message: `[Simulation Sandbox] Located ${matches.length} matching file(s) in local sandbox repository`,
      timestamp: new Date().toISOString(),
      metadata: { query, count: matches.length, mode: 'simulation' },
    };

    return {
      files: matches.map(({ content, ...rest }) => rest),
      verification,
    };
  }

  public async getFileMetadata(fileId: string): Promise<{
    file: Omit<WorkspaceFileItem, 'content'>;
    verification: VerificationResult;
  }> {
    const file = this.files.find(f => f.id === fileId || f.name.toLowerCase() === fileId.toLowerCase());
    if (!file) {
      throw new Error(`[Simulation Sandbox] File not found: ${fileId}`);
    }
    const { content, ...rest } = file;
    return {
      file: rest,
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: `sim_meta_${file.id}`,
        message: `[Simulation Sandbox] Metadata resolved for file: ${file.name}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async readFile(fileId: string): Promise<{
    file: WorkspaceFileItem;
    verification: VerificationResult;
  }> {
    const file = this.files.find(f => f.id === fileId || f.name.toLowerCase().includes(fileId.toLowerCase()));
    if (!file) {
      throw new Error(`[Simulation Sandbox] File not found: ${fileId}`);
    }
    return {
      file: { ...file },
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: `sim_read_${file.id}`,
        message: `[Simulation Sandbox] Content read from file: ${file.name} (${file.content.length} characters)`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async createFile(name: string, content: string, folder = '/Drive/Documents'): Promise<{
    file: { id: string; name: string; folder: string; sizeBytes: number };
    verification: VerificationResult;
  }> {
    const newId = `sim_file_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const sizeBytes = Buffer.byteLength(content || '', 'utf8');
    const newFile: WorkspaceFileItem = {
      id: newId,
      name,
      mimeType: name.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
      folder,
      sizeBytes,
      modifiedAt: new Date().toISOString(),
      content,
      metadata: { simulated: true },
    };
    this.files.unshift(newFile);

    return {
      file: { id: newId, name, folder, sizeBytes },
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: newId,
        message: `[Simulation Sandbox] File created in sandbox: ${folder}/${name}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async deleteFile(fileId: string): Promise<{
    deleted: { id: string; name: string; deletedAt: string };
    verification: VerificationResult;
  }> {
    const idx = this.files.findIndex(f => f.id === fileId || f.name.toLowerCase().includes(fileId.toLowerCase()));
    if (idx === -1) {
      throw new Error(`[Simulation Sandbox] File not found for deletion: ${fileId}`);
    }
    const [deleted] = this.files.splice(idx, 1);
    const deletedAt = new Date().toISOString();

    return {
      deleted: { id: deleted.id, name: deleted.name, deletedAt },
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: `sim_del_${deleted.id}`,
        message: `[Simulation Sandbox] File removed from sandbox repository: ${deleted.name}`,
        timestamp: deletedAt,
      },
    };
  }

  public async moveFile(fileId: string, targetFolder: string): Promise<{
    moved: { fileId: string; name: string; newFolder: string; movedAt: string };
    verification: VerificationResult;
  }> {
    const file = this.files.find(f => f.id === fileId || f.name.toLowerCase().includes(fileId.toLowerCase()));
    if (!file) {
      throw new Error(`[Simulation Sandbox] File not found to move: ${fileId}`);
    }
    file.folder = targetFolder;
    const movedAt = new Date().toISOString();

    return {
      moved: { fileId: file.id, name: file.name, newFolder: targetFolder, movedAt },
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: `sim_mov_${file.id}`,
        message: `[Simulation Sandbox] File moved to: ${targetFolder}/${file.name}`,
        timestamp: movedAt,
      },
    };
  }
}

export class SimulationEmailAdapter implements IEmailAdapter {
  public readonly mode: ExecutionMode = 'simulation';
  private emails: WorkspaceEmailItem[] = [];

  constructor(initialEmails?: WorkspaceEmailItem[]) {
    this.emails = initialEmails ? [...initialEmails] : this.getDefaultEmails();
  }

  public reset(customEmails?: WorkspaceEmailItem[]) {
    this.emails = customEmails ? [...customEmails] : this.getDefaultEmails();
  }

  private getDefaultEmails(): WorkspaceEmailItem[] {
    return [
      {
        id: 'sim_msg_01',
        threadId: 'th_01',
        from: 'billing@service-provider.com',
        to: 'user@example.com',
        subject: 'Monthly Service Statement Notification',
        date: '2026-09-15T15:00:00Z',
        snippet: 'Your statement for September 2026 is now available for review...',
        body: 'Dear Customer, Your monthly billing statement is now ready. Please review the attached details.',
      },
    ];
  }

  public async searchEmails(query: string): Promise<{
    emails: WorkspaceEmailItem[];
    verification: VerificationResult;
  }> {
    const q = (query || '').toLowerCase();
    const matches = this.emails.filter(e =>
      e.subject.toLowerCase().includes(q) ||
      e.snippet.toLowerCase().includes(q) ||
      e.from.toLowerCase().includes(q)
    );

    return {
      emails: matches,
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: `sim_gmail_s_${Date.now().toString(36)}`,
        message: `[Simulation Sandbox] Matched ${matches.length} message(s) in sandbox inbox`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async readEmail(messageId: string): Promise<{
    email: WorkspaceEmailItem;
    verification: VerificationResult;
  }> {
    const email = this.emails.find(e => e.id === messageId);
    if (!email) {
      throw new Error(`[Simulation Sandbox] Email not found: ${messageId}`);
    }
    return {
      email,
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: `sim_mail_r_${email.id}`,
        message: `[Simulation Sandbox] Read email: "${email.subject}"`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async draftEmail(to: string, subject: string, body: string): Promise<{
    draft: { draftId: string; to: string; subject: string; body: string; createdAt: string };
    verification: VerificationResult;
  }> {
    const draftId = `sim_draft_${Date.now().toString(36)}`;
    const createdAt = new Date().toISOString();
    return {
      draft: { draftId, to, subject, body, createdAt },
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: draftId,
        message: `[Simulation Sandbox] Draft composed for ${to}`,
        timestamp: createdAt,
      },
    };
  }

  public async sendEmail(to: string, subject: string, body: string, idempotencyKey?: string): Promise<{
    sent: { status: string; messageId: string; recipient: string; subject: string; dispatchedAt: string };
    verification: VerificationResult;
  }> {
    const messageId = `sim_sent_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const dispatchedAt = new Date().toISOString();
    const sentItem: WorkspaceEmailItem = {
      id: messageId,
      threadId: `th_${Date.now().toString(36)}`,
      from: 'operator@local-sandbox.internal',
      to,
      subject,
      date: dispatchedAt,
      snippet: body.slice(0, 100),
      body,
    };
    this.emails.unshift(sentItem);

    return {
      sent: {
        status: 'simulated_dispatched',
        messageId,
        recipient: to,
        subject,
        dispatchedAt,
      },
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: messageId,
        message: `[Simulation Sandbox] Email dispatch recorded to ${to} (Sandbox Msg ID: ${messageId})`,
        timestamp: dispatchedAt,
      },
    };
  }
}

export class SimulationCalendarAdapter implements ICalendarAdapter {
  public readonly mode: ExecutionMode = 'simulation';
  private events: WorkspaceCalendarEventItem[] = [];

  constructor(initialEvents?: WorkspaceCalendarEventItem[]) {
    this.events = initialEvents ? [...initialEvents] : this.getDefaultEvents();
  }

  public reset(customEvents?: WorkspaceCalendarEventItem[]) {
    this.events = customEvents ? [...customEvents] : this.getDefaultEvents();
  }

  private getDefaultEvents(): WorkspaceCalendarEventItem[] {
    return [
      {
        id: 'sim_evt_01',
        title: 'Architecture Review',
        start: '2026-09-18T09:30:00+08:00',
        end: '2026-09-18T10:30:00+08:00',
        attendees: ['lead-architect@example.com'],
        location: 'Virtual Conference',
      },
      {
        id: 'sim_evt_02',
        title: 'Executive Sync',
        start: '2026-09-18T14:00:00+08:00',
        end: '2026-09-18T15:00:00+08:00',
        attendees: ['director@example.com'],
        location: 'Meeting Room A',
      },
    ];
  }

  public async checkCalendar(date?: string, slotDurationMinutes = 60): Promise<{
    dateChecked: string;
    scheduledEvents: WorkspaceCalendarEventItem[];
    availableFreeSlots: Array<{ start: string; end: string; durationMinutes: number; note: string }>;
    verification: VerificationResult;
  }> {
    const targetDate = date || 'scheduled date';
    const freeSlots = [
      { start: '10:30', end: '12:00', durationMinutes: 90, note: 'Mid-morning available slot' },
      { start: '12:00', end: '14:00', durationMinutes: 120, note: 'Mid-day lunch / buffer slot' },
      { start: '15:00', end: '16:30', durationMinutes: 90, note: 'Afternoon focus slot' },
    ];

    return {
      dateChecked: targetDate,
      scheduledEvents: [...this.events],
      availableFreeSlots: freeSlots,
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: `sim_cal_${Date.now().toString(36)}`,
        message: `[Simulation Sandbox] Calendar scanned: ${this.events.length} existing commitments, ${freeSlots.length} free windows`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async createEvent(
    title: string,
    start: string,
    end: string,
    attendees: string[] = [],
    description?: string
  ): Promise<{
    event: WorkspaceCalendarEventItem;
    verification: VerificationResult;
  }> {
    const evtId = `sim_evt_${Date.now().toString(36)}`;
    const event: WorkspaceCalendarEventItem = {
      id: evtId,
      title,
      start,
      end,
      attendees,
      description,
    };
    this.events.push(event);

    return {
      event,
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: evtId,
        message: `[Simulation Sandbox] Event scheduled in sandbox calendar: "${title}" at ${start}`,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export class SimulationDocumentAnalysisAdapter implements IDocumentAnalysisAdapter {
  public readonly mode: ExecutionMode = 'simulation';

  public async analyze(text: string, task = 'summarize', compareWithText?: string): Promise<{
    analysis: {
      lineCount: number;
      wordCount: number;
      characterCount: number;
      extractedEntities: {
        monetaryValues: string[];
        dates: string[];
        invoiceNumbers: string[];
        emails: string[];
      };
      summaryLines: string[];
      comparison?: {
        addedLinesCount: number;
        removedLinesCount: number;
        diffSummary: string;
      };
    };
    verification: VerificationResult;
  }> {
    const cleanText = text || '';
    const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
    const words = cleanText.split(/\s+/).filter(Boolean);

    // Entity extraction via regex patterns
    const moneyRegex = /(?:MYR|USD|SGD|EUR|GBP|\$|€|£)\s?[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?/gi;
    const dateRegex = /(?:\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4}-\d{2}-\d{2})/gi;
    const invoiceRegex = /(?:INV|BILL|REC)[-A-Za-z0-9_]+/gi;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

    const monetaryValues = Array.from(new Set(cleanText.match(moneyRegex) || []));
    const dates = Array.from(new Set(cleanText.match(dateRegex) || []));
    const invoiceNumbers = Array.from(new Set(cleanText.match(invoiceRegex) || []));
    const emails = Array.from(new Set(cleanText.match(emailRegex) || []));

    // Dynamic Summary synthesis from real text
    const summaryLines: string[] = [];
    if (invoiceNumbers.length > 0) {
      summaryLines.push(`Reference/Invoice: ${invoiceNumbers.join(', ')}`);
    }
    if (monetaryValues.length > 0) {
      summaryLines.push(`Financial Amounts Identified: ${monetaryValues.join(', ')}`);
    }
    if (dates.length > 0) {
      summaryLines.push(`Relevant Dates: ${dates.join(', ')}`);
    }
    if (lines.length > 0 && summaryLines.length === 0) {
      summaryLines.push(`Header: ${lines[0]}`);
      if (lines.length > 1) {
        summaryLines.push(`Body snippet: ${lines[1].slice(0, 120)}`);
      }
    }

    let comparison: { addedLinesCount: number; removedLinesCount: number; diffSummary: string } | undefined;
    if (compareWithText) {
      const baseLines = new Set(compareWithText.split('\n').map(l => l.trim()).filter(Boolean));
      const currentLines = new Set(lines);

      let added = 0;
      let removed = 0;
      currentLines.forEach(l => {
        if (!baseLines.has(l)) added++;
      });
      baseLines.forEach(l => {
        if (!currentLines.has(l)) removed++;
      });

      comparison = {
        addedLinesCount: added,
        removedLinesCount: removed,
        diffSummary: `Comparison against baseline: ${added} added line(s), ${removed} removed line(s).`,
      };
    }

    return {
      analysis: {
        lineCount: lines.length,
        wordCount: words.length,
        characterCount: cleanText.length,
        extractedEntities: {
          monetaryValues,
          dates,
          invoiceNumbers,
          emails,
        },
        summaryLines,
        comparison,
      },
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: `sim_doc_${Date.now().toString(36)}`,
        message: `[Simulation Sandbox] Document analyzed: ${lines.length} lines, ${words.length} words, ${monetaryValues.length} financial values`,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export class SimulationCalculationAdapter implements ICalculationAdapter {
  public readonly mode: ExecutionMode = 'simulation';

  public async evaluate(expression: string, label = 'Calculation'): Promise<{
    expression: string;
    result: number;
    formattedResult: string;
    label: string;
    verification: VerificationResult;
  }> {
    const raw = String(expression || '').trim();
    // Sanitize: allow numbers, operators, parens, percentages, spaces
    const sanitized = raw
      .replace(/,/g, '')
      .replace(/(\d+(?:\.\d+)?)%/g, '($1/100)')
      .replace(/[^0-9+\-*/(). ]/g, '');

    if (!sanitized || !/[0-9]/.test(sanitized)) {
      throw new Error(`Invalid mathematical expression: "${expression}"`);
    }

    let result = 0;
    try {
      // Safe evaluation with isolated context
      // eslint-disable-next-line no-eval
      result = Function(`'use strict'; return (${sanitized})`)();
      if (typeof result !== 'number' || Number.isNaN(result) || !Number.isFinite(result)) {
        throw new Error(`Expression evaluated to invalid number: ${result}`);
      }
    } catch (err: any) {
      throw new Error(`Math evaluation error for "${expression}": ${err.message}`);
    }

    const formattedResult = result.toLocaleString('en-US', {
      maximumFractionDigits: 4,
      minimumFractionDigits: Number.isInteger(result) ? 0 : 2,
    });

    return {
      expression: raw,
      result,
      formattedResult,
      label,
      verification: {
        verified: true,
        isSimulated: false, // Pure deterministic arithmetic is mathematically verified
        verificationId: `calc_${Date.now().toString(36)}`,
        message: `Deterministic computation verified: ${raw} = ${formattedResult}`,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export class SimulationNotificationAdapter implements INotificationAdapter {
  public readonly mode: ExecutionMode = 'simulation';

  public async sendAlert(message: string, channel = '@sandbox_channel'): Promise<{
    dispatchId: string;
    channel: string;
    message: string;
    timestamp: string;
    verification: VerificationResult;
  }> {
    const dispatchId = `sim_notify_${Date.now().toString(36)}`;
    const timestamp = new Date().toISOString();
    return {
      dispatchId,
      channel,
      message,
      timestamp,
      verification: {
        verified: true,
        isSimulated: true,
        verificationId: dispatchId,
        message: `[Simulation Sandbox] Notification broadcast simulated to ${channel}`,
        timestamp,
      },
    };
  }
}

export function createSimulationAdapters(): AdapterBundle {
  return {
    drive: new SimulationDriveAdapter(),
    email: new SimulationEmailAdapter(),
    calendar: new SimulationCalendarAdapter(),
    document: new SimulationDocumentAnalysisAdapter(),
    calculate: new SimulationCalculationAdapter(),
    notification: new SimulationNotificationAdapter(),
  };
}
