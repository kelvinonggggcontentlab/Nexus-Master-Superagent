export type ActionCategory = 'read' | 'write' | 'destructive';
export type ExecutionMode = 'simulation' | 'production';

export interface VerificationResult {
  verified: boolean;
  isSimulated: boolean;
  verificationId: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface WorkspaceFileItem {
  id: string;
  name: string;
  mimeType: string;
  folder: string;
  sizeBytes: number;
  modifiedAt: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface WorkspaceEmailItem {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}

export interface WorkspaceCalendarEventItem {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  location?: string;
  description?: string;
}

export interface IDriveAdapter {
  readonly mode: ExecutionMode;
  searchFiles(query: string, fileType?: string): Promise<{
    files: Array<Omit<WorkspaceFileItem, 'content'>>;
    verification: VerificationResult;
  }>;
  getFileMetadata(fileId: string): Promise<{
    file: Omit<WorkspaceFileItem, 'content'>;
    verification: VerificationResult;
  }>;
  readFile(fileId: string): Promise<{
    file: WorkspaceFileItem;
    verification: VerificationResult;
  }>;
  createFile(name: string, content: string, folder?: string): Promise<{
    file: { id: string; name: string; folder: string; sizeBytes: number };
    verification: VerificationResult;
  }>;
  deleteFile(fileId: string): Promise<{
    deleted: { id: string; name: string; deletedAt: string };
    verification: VerificationResult;
  }>;
  moveFile(fileId: string, targetFolder: string): Promise<{
    moved: { fileId: string; name: string; newFolder: string; movedAt: string };
    verification: VerificationResult;
  }>;
}

export interface IEmailAdapter {
  readonly mode: ExecutionMode;
  searchEmails(query: string): Promise<{
    emails: WorkspaceEmailItem[];
    verification: VerificationResult;
  }>;
  readEmail(messageId: string): Promise<{
    email: WorkspaceEmailItem;
    verification: VerificationResult;
  }>;
  draftEmail(to: string, subject: string, body: string): Promise<{
    draft: { draftId: string; to: string; subject: string; body: string; createdAt: string };
    verification: VerificationResult;
  }>;
  sendEmail(to: string, subject: string, body: string, idempotencyKey?: string): Promise<{
    sent: { status: string; messageId: string; recipient: string; subject: string; dispatchedAt: string };
    verification: VerificationResult;
  }>;
}

export interface ICalendarAdapter {
  readonly mode: ExecutionMode;
  checkCalendar(date?: string, slotDurationMinutes?: number): Promise<{
    dateChecked: string;
    scheduledEvents: WorkspaceCalendarEventItem[];
    availableFreeSlots: Array<{ start: string; end: string; durationMinutes: number; note: string }>;
    verification: VerificationResult;
  }>;
  createEvent(title: string, start: string, end: string, attendees?: string[], description?: string): Promise<{
    event: WorkspaceCalendarEventItem;
    verification: VerificationResult;
  }>;
}

export interface IDocumentAnalysisAdapter {
  readonly mode: ExecutionMode;
  analyze(text: string, task?: string, compareWithText?: string): Promise<{
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
  }>;
}

export interface ICalculationAdapter {
  readonly mode: ExecutionMode;
  evaluate(expression: string, label?: string): Promise<{
    expression: string;
    result: number;
    formattedResult: string;
    label: string;
    verification: VerificationResult;
  }>;
}

export interface INotificationAdapter {
  readonly mode: ExecutionMode;
  sendAlert(message: string, channel?: string): Promise<{
    dispatchId: string;
    channel: string;
    message: string;
    timestamp: string;
    verification: VerificationResult;
  }>;
}

export interface AdapterBundle {
  drive: IDriveAdapter;
  email: IEmailAdapter;
  calendar: ICalendarAdapter;
  document: IDocumentAnalysisAdapter;
  calculate: ICalculationAdapter;
  notification: INotificationAdapter;
}
