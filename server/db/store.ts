import {
  ConversationSession,
  NexusMessage,
  ExecutionRun,
  ToolCallLog,
  MemoryRecord,
  IntegrationAccount,
} from '../../src/types/nexus';

class NexusStore {
  private conversations: Map<string, ConversationSession> = new Map();
  private messages: Map<string, NexusMessage[]> = new Map();
  private executionRuns: Map<string, ExecutionRun> = new Map();
  private toolLogs: ToolCallLog[] = [];
  private idempotencyKeys: Map<string, number> = new Map();
  private memories: Map<string, MemoryRecord> = new Map();
  private integrations: Map<string, IntegrationAccount> = new Map();

  constructor() {
    this.seedDefaultState();
  }

  public reset() {
    this.conversations.clear();
    this.messages.clear();
    this.executionRuns.clear();
    this.toolLogs = [];
    this.idempotencyKeys.clear();
    this.memories.clear();
    this.integrations.clear();
    this.seedDefaultState();
  }

  private seedDefaultState() {
    // Honest Integrations state: unconfigured until real credentials or sandbox is toggled
    this.integrations.set('google_drive', {
      service: 'google_drive',
      name: 'Google Drive',
      connected: false,
      mode: 'simulation',
      accountEmail: 'sandbox@local.internal',
      lastSync: new Date().toISOString(),
      scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'],
    });

    this.integrations.set('gmail', {
      service: 'gmail',
      name: 'Gmail',
      connected: false,
      mode: 'simulation',
      accountEmail: 'sandbox@local.internal',
      lastSync: new Date().toISOString(),
      scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
    });

    this.integrations.set('google_calendar', {
      service: 'google_calendar',
      name: 'Google Calendar',
      connected: false,
      mode: 'simulation',
      accountEmail: 'sandbox@local.internal',
      lastSync: new Date().toISOString(),
      scopes: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'],
    });

    this.integrations.set('supabase', {
      service: 'supabase',
      name: 'Supabase Storage',
      connected: !!process.env.SUPABASE_URL,
      mode: process.env.SUPABASE_URL ? 'production' : 'simulation',
      accountEmail: process.env.SUPABASE_URL ? 'live-cloud-cluster' : 'local-durable-vault',
      lastSync: new Date().toISOString(),
      scopes: ['database.read', 'database.write', 'audit.log'],
    });

    this.integrations.set('telegram', {
      service: 'telegram',
      name: 'Telegram Dispatcher',
      connected: !!process.env.TELEGRAM_BOT_TOKEN,
      mode: process.env.TELEGRAM_BOT_TOKEN ? 'production' : 'simulation',
      accountEmail: process.env.TELEGRAM_BOT_TOKEN ? '@configured_bot' : '@sandbox_bot',
      lastSync: new Date().toISOString(),
      scopes: ['bot.send_message'],
    });

    // Default neutral persistent rules (no hardcoded personal identities)
    this.setMemory('organization', 'BLACKTOWER™', 'project_context');
    this.setMemory('executive_summary_format', 'Structured bullet points with execution verification', 'rule');
  }

  // Conversation methods
  public getConversations(): ConversationSession[] {
    return Array.from(this.conversations.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public getOrCreateConversation(id?: string): ConversationSession {
    if (id && this.conversations.has(id)) {
      return this.conversations.get(id)!;
    }
    const newId = id || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const session: ConversationSession = {
      id: newId,
      title: 'New Session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };
    this.conversations.set(newId, session);
    this.messages.set(newId, []);
    return session;
  }

  public deleteConversation(id: string): boolean {
    this.conversations.delete(id);
    this.messages.delete(id);
    return true;
  }

  public updateConversationTitle(id: string, title: string) {
    const conv = this.conversations.get(id);
    if (conv) {
      conv.title = title;
      conv.updatedAt = new Date().toISOString();
    }
  }

  // Message methods
  public getMessages(conversationId: string): NexusMessage[] {
    return this.messages.get(conversationId) || [];
  }

  public addMessage(conversationId: string, message: NexusMessage): NexusMessage {
    const list = this.messages.get(conversationId) || [];
    list.push(message);
    this.messages.set(conversationId, list);

    const conv = this.conversations.get(conversationId);
    if (conv) {
      conv.messageCount = list.length;
      conv.updatedAt = new Date().toISOString();
      if (conv.title === 'New Session' && message.role === 'user') {
        conv.title = message.content.slice(0, 36) + (message.content.length > 36 ? '...' : '');
      }
    }
    return message;
  }

  public updateMessage(conversationId: string, messageId: string, updates: Partial<NexusMessage>): NexusMessage | null {
    const list = this.messages.get(conversationId) || [];
    const index = list.findIndex(m => m.id === messageId);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      return list[index];
    }
    return null;
  }

  // Execution Runs
  public saveExecutionRun(run: ExecutionRun) {
    this.executionRuns.set(run.id, { ...run, updatedAt: new Date().toISOString() });
  }

  public getExecutionRun(id: string): ExecutionRun | undefined {
    return this.executionRuns.get(id);
  }

  // Tool Audit Logs & Idempotency
  public logToolCall(log: ToolCallLog) {
    this.toolLogs.unshift(log);
    if (this.toolLogs.length > 200) {
      this.toolLogs.pop();
    }
  }

  public getToolLogs(limit = 50): ToolCallLog[] {
    return this.toolLogs.slice(0, limit);
  }

  public checkAndSetIdempotencyKey(key: string): boolean {
    if (this.idempotencyKeys.has(key)) {
      return false; // Already executed
    }
    this.idempotencyKeys.set(key, Date.now());
    return true; // Fresh key
  }

  // Memory
  public getMemories(): MemoryRecord[] {
    return Array.from(this.memories.values());
  }

  public setMemory(key: string, value: string, category: MemoryRecord['category']): MemoryRecord {
    const record: MemoryRecord = {
      id: `mem_${key}`,
      key,
      value,
      category,
      updatedAt: new Date().toISOString(),
    };
    this.memories.set(key, record);
    return record;
  }

  public getMemory(key: string): string | undefined {
    return this.memories.get(key)?.value;
  }

  // Integrations
  public getIntegrations(): IntegrationAccount[] {
    return Array.from(this.integrations.values());
  }

  public setIntegrationStatus(service: string, connected: boolean) {
    const intg = this.integrations.get(service);
    if (intg) {
      intg.connected = connected;
      intg.lastSync = new Date().toISOString();
    }
  }

  // Observability summary
  public getObservabilitySummary() {
    const runs = Array.from(this.executionRuns.values());
    return {
      totalRuns: runs.length,
      successfulRuns: runs.filter(r => r.status === 'completed').length,
      failedRuns: runs.filter(r => r.status === 'failed').length,
      toolCallsCount: this.toolLogs.length,
      recentLogs: this.toolLogs.slice(0, 20),
      integrations: Array.from(this.integrations.values()),
    };
  }
}

export const nexusStore = new NexusStore();
