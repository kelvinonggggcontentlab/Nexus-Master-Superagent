export type ActionCategory = 'read' | 'write' | 'destructive';

export type TaskStatus = 
  | 'pending' 
  | 'planning' 
  | 'in_progress' 
  | 'completed' 
  | 'failed' 
  | 'waiting_confirmation' 
  | 'cancelled'
  | 'replanning';

export type RiskLevel =
  | 'LOW_RISK'
  | 'READ_ONLY'
  | 'WRITE'
  | 'DESTRUCTIVE'
  | 'SECURITY_SENSITIVE';

export interface ToolDefinition {
  name: string;
  category: 'drive' | 'gmail' | 'calendar' | 'document' | 'web' | 'memory' | 'notification';
  actionType: ActionCategory;
  riskLevel?: RiskLevel;
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
  riskLevel?: RiskLevel;
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
    isSimulated?: boolean;
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
  userId?: string;
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
    isSimulated?: boolean;
    timestamp?: string;
  }>;
  finalResponse?: string;
  error?: string;
  isSimulated?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCallLog {
  id: string;
  runId: string;
  userId?: string;
  tool: string;
  actionType: ActionCategory;
  riskLevel?: RiskLevel;
  parameters: Record<string, any>;
  result: any;
  status: 'success' | 'failed';
  isSimulated?: boolean;
  error?: string;
  durationMs: number;
  idempotencyKey?: string;
  timestamp: string;
}

export interface NexusMessage {
  id: string;
  userId?: string;
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
  userId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface MemoryRecord {
  id: string;
  userId?: string;
  key: string;
  value: string;
  category: 'preference' | 'project_context' | 'contact' | 'rule' | 'custom';
  updatedAt: string;
}

export interface IntegrationAccount {
  service: 'google_drive' | 'gmail' | 'google_calendar' | 'supabase' | 'telegram';
  name: string;
  connected: boolean;
  mode?: 'simulation' | 'production';
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

// Gateway & Security Center Types
export interface TrustedDeviceView {
  id: string;
  label: string;
  platform: string;
  isCurrentDevice: boolean;
  registeredAt: string;
  lastActiveAt: string;
  revoked: boolean;
}

export interface ActiveSessionView {
  sessionId: string;
  deviceId: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  isCurrentSession: boolean;
}

export interface SecurityStatusView {
  isLocked: boolean;
  authenticated: boolean;
  user?: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
  activeSessionCount: number;
  trustedDeviceCount: number;
  autoLockMinutes: number;
  autonomousActionsEnabled: boolean;
  highRiskConfirmationRequired: boolean;
}

export interface SecurityEventView {
  id: string;
  type: string;
  timestamp: string;
  details: Record<string, any>;
}
