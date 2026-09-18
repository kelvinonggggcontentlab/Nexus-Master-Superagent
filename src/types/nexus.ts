export type ActionCategory = 'read' | 'write' | 'destructive';

export type TaskStatus = 
  | 'pending' 
  | 'planning'
  | 'in_progress' 
  | 'completed' 
  | 'failed' 
  | 'waiting_confirmation' 
  | 'replanning';

export interface ToolDefinition {
  name: string;
  category: 'drive' | 'gmail' | 'calendar' | 'document' | 'web' | 'memory' | 'notification';
  actionType: ActionCategory;
  description: string;
  parameters: Record<string, any>;
  requiresAuth: string[];
  verificationStrategy: string;
  isIdempotent: boolean;
}

export interface TaskStep {
  id: string;
  taskId: string;
  stepNumber: number;
  title: string;
  description: string;
  tool: string;
  parameters: Record<string, any>;
  actionType: ActionCategory;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'verified';
  dependencies: string[]; // step IDs
  requiresConfirmation?: boolean;
  confirmationReason?: string;
  confirmationGranted?: boolean;
  result?: any;
  error?: string;
  verificationDetails?: {
    verified: boolean;
    verificationId?: string;
    verifiedAt?: string;
    message?: string;
  };
  startedAt?: string;
  completedAt?: string;
}

export interface ExecutionPlan {
  id: string;
  userGoal: string;
  intent: string;
  requiresConfirmation: boolean;
  confirmationReason?: string;
  steps: TaskStep[];
  estimatedTools: string[];
}

export interface ExecutionRun {
  id: string;
  conversationId: string;
  userPrompt: string;
  status: TaskStatus;
  plan: ExecutionPlan;
  currentStepIndex: number;
  stepsCompleted: number;
  totalSteps: number;
  activeStatusText: string;
  results: Record<string, any>;
  verificationBadges: Array<{
    label: string;
    verified: boolean;
    timestamp?: string;
  }>;
  finalResponse?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCallLog {
  id: string;
  runId: string;
  tool: string;
  actionType: ActionCategory;
  parameters: Record<string, any>;
  result: any;
  status: 'success' | 'failed';
  error?: string;
  durationMs: number;
  idempotencyKey?: string;
  timestamp: string;
}

export interface NexusMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachments?: Array<{
    name: string;
    type: string;
    size: number;
    url?: string;
    previewContent?: string;
  }>;
  executionRun?: ExecutionRun;
}

export interface ConversationSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface MemoryRecord {
  id: string;
  key: string;
  value: string;
  category: 'preference' | 'project_context' | 'contact' | 'rule' | 'custom';
  updatedAt: string;
}

export interface IntegrationAccount {
  service: 'google_drive' | 'gmail' | 'google_calendar' | 'supabase' | 'telegram';
  name: string;
  connected: boolean;
  accountEmail?: string;
  lastSync?: string;
  scopes: string[];
}

export interface ObservabilitySummary {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  toolCallsCount: number;
  recentLogs: ToolCallLog[];
  integrations: IntegrationAccount[];
}
