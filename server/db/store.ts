import {
  ConversationSession,
  NexusMessage,
  ExecutionRun,
  ToolCallLog,
  MemoryRecord,
  IntegrationAccount,
} from '../../src/types/nexus';
import { resetAdapters } from '../adapters';

export class NexusStore {
  // Keyed by userId -> data for strict Multi-Tenant / User Isolation
  private conversations: Map<string, ConversationSession> = new Map();
  private messages: Map<string, NexusMessage[]> = new Map(); // conversationId -> messages
  private executionRuns: Map<string, ExecutionRun> = new Map();
  private toolLogs: ToolCallLog[] = [];
  private memories: Map<string, MemoryRecord> = new Map(); // userId:key -> MemoryRecord
  private idempotencyKeys: Map<string, number> = new Map();
  private integrations: Map<string, IntegrationAccount> = new Map();

  constructor() {
    this.seedDefaultIntegrations();
    this.seedDefaultMemories();
  }

  private seedDefaultMemories() {
    this.setMemory('organization', 'BLACKTOWER™', 'custom', 'usr_blacktower_root');
    this.setMemory('default_currency', 'MYR', 'preference', 'usr_blacktower_root');
    this.setMemory('timezone', 'Asia/Kuala_Lumpur', 'preference', 'usr_blacktower_root');
    this.setMemory('compliance_framework', 'ZERO_TRUST_ENCLAVE', 'rule', 'usr_blacktower_root');
  }

  private seedDefaultIntegrations() {
    const defaultAccounts: IntegrationAccount[] = [
      {
        service: 'google_drive',
        name: 'Google Drive Enterprise API',
        connected: false,
        mode: 'production',
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/drive.file',
        ],
      },
      {
        service: 'gmail',
        name: 'Gmail REST Messaging Engine',
        connected: false,
        mode: 'production',
        scopes: [
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.readonly',
        ],
      },
      {
        service: 'google_calendar',
        name: 'Google Calendar v3 Service',
        connected: false,
        mode: 'production',
        scopes: [
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/calendar.readonly',
        ],
      },
      {
        service: 'supabase',
        name: 'Supabase Vector Memory',
        connected: true,
        mode: 'simulation',
        scopes: ['memory.read', 'memory.write'],
      },
    ];

    defaultAccounts.forEach(acc => this.integrations.set(acc.service, acc));
  }

  // Conversation methods (with user isolation)
  public getConversations(userId?: string): ConversationSession[] {
    const list = Array.from(this.conversations.values());
    const filtered = userId ? list.filter(c => !c.userId || c.userId === userId) : list;
    return filtered.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public getOrCreateConversation(id?: string, userId?: string): ConversationSession {
    if (id && this.conversations.has(id)) {
      const existing = this.conversations.get(id)!;
      // If user specified and conversation has different userId, protect isolation
      if (userId && existing.userId && existing.userId !== userId) {
        throw new Error('Access denied: Conversation belongs to another user.');
      }
      return existing;
    }
    const newId = id || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const session: ConversationSession = {
      id: newId,
      userId: userId || 'usr_blacktower_root',
      title: 'New Session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };
    this.conversations.set(newId, session);
    this.messages.set(newId, []);
    return session;
  }

  public deleteConversation(id: string, userId?: string): boolean {
    const existing = this.conversations.get(id);
    if (existing && userId && existing.userId && existing.userId !== userId) {
      throw new Error('Access denied: Cannot delete another user\'s conversation.');
    }
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

  // Message methods (with user isolation)
  public getMessages(conversationId: string, userId?: string): NexusMessage[] {
    const conv = this.conversations.get(conversationId);
    if (conv && userId && conv.userId && conv.userId !== userId) {
      throw new Error('Access denied: Cannot read messages for another user\'s conversation.');
    }
    return this.messages.get(conversationId) || [];
  }

  public addMessage(conversationId: string, message: NexusMessage, userId?: string): NexusMessage {
    const conv = this.conversations.get(conversationId);
    if (conv && userId && conv.userId && conv.userId !== userId) {
      throw new Error('Access denied: Cannot add message to another user\'s conversation.');
    }

    const list = this.messages.get(conversationId) || [];
    const msgWithUser = { ...message, userId: userId || conv?.userId || 'usr_blacktower_root' };
    list.push(msgWithUser);
    this.messages.set(conversationId, list);

    if (conv) {
      conv.messageCount = list.length;
      conv.updatedAt = new Date().toISOString();
      if (conv.title === 'New Session' && message.role === 'user') {
        conv.title = message.content.slice(0, 36) + (message.content.length > 36 ? '...' : '');
      }
    }
    return msgWithUser;
  }

  public updateMessage(
    conversationId: string,
    messageId: string,
    updates: Partial<NexusMessage>
  ): NexusMessage | null {
    const list = this.messages.get(conversationId) || [];
    const index = list.findIndex(m => m.id === messageId);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      return list[index];
    }
    return null;
  }

  // Execution Runs
  public saveExecutionRun(run: ExecutionRun, userId?: string) {
    this.executionRuns.set(run.id, {
      ...run,
      userId: userId || run.userId || 'usr_blacktower_root',
      updatedAt: new Date().toISOString(),
    });
  }

  public getExecutionRun(id: string, userId?: string): ExecutionRun | undefined {
    const run = this.executionRuns.get(id);
    if (run && userId && run.userId && run.userId !== userId) {
      return undefined;
    }
    return run;
  }

  // Tool Audit Logs & Idempotency
  public logToolCall(log: ToolCallLog) {
    this.toolLogs.unshift(log);
    if (this.toolLogs.length > 300) {
      this.toolLogs.pop();
    }
  }

  public getToolLogs(limit = 50, userId?: string): ToolCallLog[] {
    const logs = userId ? this.toolLogs.filter(l => !l.userId || l.userId === userId) : this.toolLogs;
    return logs.slice(0, limit);
  }

  public checkAndSetIdempotencyKey(key: string): boolean {
    if (this.idempotencyKeys.has(key)) {
      return false; // Already executed
    }
    this.idempotencyKeys.set(key, Date.now());
    return true; // Fresh key
  }

  // Memory (with user isolation)
  public getMemories(userId?: string): MemoryRecord[] {
    const targetUserId = userId || 'usr_blacktower_root';
    return Array.from(this.memories.values()).filter(
      m => !m.userId || m.userId === targetUserId
    );
  }

  public setMemory(
    key: string,
    value: string,
    category: MemoryRecord['category'],
    userId?: string
  ): MemoryRecord {
    const targetUserId = userId || 'usr_blacktower_root';
    const storeKey = `${targetUserId}:${key}`;
    const record: MemoryRecord = {
      id: `mem_${key}`,
      userId: targetUserId,
      key,
      value,
      category,
      updatedAt: new Date().toISOString(),
    };
    this.memories.set(storeKey, record);
    return record;
  }

  public getMemory(key: string, userId?: string): string | undefined {
    const targetUserId = userId || 'usr_blacktower_root';
    const storeKey = `${targetUserId}:${key}`;
    return this.memories.get(storeKey)?.value || this.memories.get(`usr_blacktower_root:${key}`)?.value;
  }

  // Integrations
  public getIntegrations(): IntegrationAccount[] {
    return Array.from(this.integrations.values());
  }

  public setIntegrationStatus(service: string, connected: boolean, email?: string) {
    const intg = this.integrations.get(service);
    if (intg) {
      intg.connected = connected;
      if (email) intg.accountEmail = email;
      intg.lastSync = new Date().toISOString();
    }
  }

  // Observability summary
  public getObservabilitySummary(userId?: string) {
    const allRuns = Array.from(this.executionRuns.values());
    const runs = userId ? allRuns.filter(r => !r.userId || r.userId === userId) : allRuns;
    const logs = this.getToolLogs(20, userId);

    return {
      totalRuns: runs.length,
      successfulRuns: runs.filter(r => r.status === 'completed').length,
      failedRuns: runs.filter(r => r.status === 'failed').length,
      toolCallsCount: logs.length,
      recentLogs: logs,
      integrations: Array.from(this.integrations.values()),
    };
  }

  // Reset method for testing and state sanitization
  public reset(): void {
    this.conversations.clear();
    this.messages.clear();
    this.executionRuns.clear();
    this.toolLogs = [];
    this.memories.clear();
    this.idempotencyKeys.clear();
    this.seedDefaultIntegrations();
    this.seedDefaultMemories();
    resetAdapters();
  }
}

export const nexusStore = new NexusStore();
