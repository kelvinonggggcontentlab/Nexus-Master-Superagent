import { NexusMessage, TaskStep, MemoryRecord, ActionCategory } from '../../src/types/nexus';
import type { SystemPersonality } from '../agent/personality';

export type ContextEntityType =
  | 'file'
  | 'email'
  | 'person'
  | 'recipient'
  | 'folder'
  | 'calendar_event'
  | 'date'
  | 'time'
  | 'amount'
  | 'document'
  | 'task';

export interface ContextEntity {
  id: string;
  type: ContextEntityType;
  identifier: string; // real ID (e.g. file ID, email messageId, email address, etc.)
  label: string;      // human readable name or description
  source: string;     // 'google_drive' | 'gmail' | 'user_prompt' | 'calculator' | 'analysis'
  confidence: number;
  conversationId: string;
  taskId?: string;
  data?: any;         // payload like content, metadata, formatted results
  verified?: boolean;
  isSimulated?: boolean;
  updatedAt: string;
}

export type ContextualIntentType =
  | 'NEW_TASK'
  | 'CONTINUE_TASK'
  | 'MODIFY_TASK'
  | 'CLARIFY'
  | 'QUERY_RESULT'
  | 'REPEAT_ACTION'
  | 'CANCEL_TASK'
  | 'RESUME_TASK'
  | 'GENERAL_CONVERSATION';

export interface ActiveTaskContext {
  taskId: string;
  conversationId: string;
  userId: string;
  originalRequest: string;
  currentObjective: string;
  currentStepIndex: number;
  steps: TaskStep[];
  completedSteps: TaskStep[];
  pendingSteps: TaskStep[];
  failedSteps: TaskStep[];
  toolResults: Record<string, any>;
  relevantEntities: ContextEntity[];
  userModifications: string[];
  status: 'active' | 'waiting_confirmation' | 'completed' | 'cancelled' | 'failed';
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssembledContext {
  userMessage: string;
  intent: ContextualIntentType;
  intentConfidence: number;
  activeTask: ActiveTaskContext | null;
  recentMessages: NexusMessage[];
  resolvedReferences: Record<string, ContextEntity>;
  relevantEntities: ContextEntity[];
  relevantToolResults: Record<string, any>;
  relevantMemories: MemoryRecord[];
  modifiedParameters?: Record<string, any>;
  ambiguities?: string[];
  clarificationQuestion?: string;
  directAnswer?: string;
  personality?: SystemPersonality;
}
