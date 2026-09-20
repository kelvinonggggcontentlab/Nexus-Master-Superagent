export type RiskLevel =
  | 'LOW_RISK'
  | 'READ_ONLY'
  | 'WRITE'
  | 'DESTRUCTIVE'
  | 'SECURITY_SENSITIVE';

export interface ToolSecurityPolicy {
  tool: string;
  riskLevel: RiskLevel;
  requiresExplicitConfirmation: boolean;
  confirmationPrompt: string;
  category: 'drive' | 'gmail' | 'calendar' | 'system' | 'financial' | 'analysis';
}

export const TOOL_RISK_POLICIES: Record<string, ToolSecurityPolicy> = {
  // Read tools (Low Risk / Read Only)
  search_drive: {
    tool: 'search_drive',
    riskLevel: 'READ_ONLY',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Search Google Drive files',
    category: 'drive',
  },
  get_file_metadata: {
    tool: 'get_file_metadata',
    riskLevel: 'READ_ONLY',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Inspect file properties',
    category: 'drive',
  },
  read_drive_file: {
    tool: 'read_drive_file',
    riskLevel: 'READ_ONLY',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Read document content',
    category: 'drive',
  },
  search_emails: {
    tool: 'search_emails',
    riskLevel: 'READ_ONLY',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Search email threads',
    category: 'gmail',
  },
  read_email: {
    tool: 'read_email',
    riskLevel: 'READ_ONLY',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Read email body',
    category: 'gmail',
  },
  check_calendar: {
    tool: 'check_calendar',
    riskLevel: 'READ_ONLY',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Inspect calendar schedule and open windows',
    category: 'calendar',
  },
  calculate: {
    tool: 'calculate',
    riskLevel: 'LOW_RISK',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Perform calculation',
    category: 'financial',
  },
  analyze_document: {
    tool: 'analyze_document',
    riskLevel: 'LOW_RISK',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Analyze document highlights or differences',
    category: 'analysis',
  },
  recall_memory: {
    tool: 'recall_memory',
    riskLevel: 'READ_ONLY',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Retrieve memory item',
    category: 'system',
  },

  // Write tools
  create_drive_file: {
    tool: 'create_drive_file',
    riskLevel: 'WRITE',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Create new file in Google Drive',
    category: 'drive',
  },
  draft_email: {
    tool: 'draft_email',
    riskLevel: 'WRITE',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Save draft email in Gmail inbox',
    category: 'gmail',
  },
  move_drive_file: {
    tool: 'move_drive_file',
    riskLevel: 'WRITE',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Move document to target folder',
    category: 'drive',
  },
  update_memory: {
    tool: 'update_memory',
    riskLevel: 'WRITE',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Persist preference in memory',
    category: 'system',
  },

  // High-Risk & Security Sensitive tools
  send_email: {
    tool: 'send_email',
    riskLevel: 'SECURITY_SENSITIVE',
    requiresExplicitConfirmation: true,
    confirmationPrompt: 'Sending an external email immediately contacts a recipient outside your perimeter.',
    category: 'gmail',
  },
  create_calendar_event: {
    tool: 'create_calendar_event',
    riskLevel: 'WRITE',
    requiresExplicitConfirmation: false,
    confirmationPrompt: 'Book calendar event and invite attendees',
    category: 'calendar',
  },
  delete_drive_file: {
    tool: 'delete_drive_file',
    riskLevel: 'DESTRUCTIVE',
    requiresExplicitConfirmation: true,
    confirmationPrompt: 'Permanently deleting a file removes it from storage irreversibly.',
    category: 'drive',
  },
};

export function getToolRiskPolicy(toolName: string): ToolSecurityPolicy {
  return (
    TOOL_RISK_POLICIES[toolName] || {
      tool: toolName,
      riskLevel: 'WRITE',
      requiresExplicitConfirmation: true,
      confirmationPrompt: `Execute action: ${toolName}`,
      category: 'system',
    }
  );
}
