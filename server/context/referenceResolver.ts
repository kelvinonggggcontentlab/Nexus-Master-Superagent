import { ContextEntity, ActiveTaskContext } from './types';

export interface ReferenceResolutionResult {
  hasReference: boolean;
  resolved: Record<string, ContextEntity>;
  isAmbiguous: boolean;
  ambiguityReason?: string;
  clarificationQuestion?: string;
}

export class ReferenceResolver {
  private static REFERENCE_PHRASES = [
    'it',
    'that',
    'this',
    'them',
    'the file',
    'the email',
    'the invoice',
    'the previous one',
    'the latest one',
    'the result',
    'the document',
    'the document we just found',
    'the email you mentioned',
    'that summary',
    'the summary',
    'the details',
    'show me the details',
    'summarize it',
    'send that',
    'change it',
  ];

  public static resolve(
    userText: string,
    activeTask: ActiveTaskContext | null,
    entities: ContextEntity[]
  ): ReferenceResolutionResult {
    const lower = userText.toLowerCase().trim();
    const resolved: Record<string, ContextEntity> = {};

    const hasRef = this.REFERENCE_PHRASES.some(phrase => {
      const regex = new RegExp(`\\b${phrase}\\b`, 'i');
      return regex.test(lower);
    });

    if (!hasRef && !lower.includes('details') && !lower.includes('summarize')) {
      return { hasReference: false, resolved: {}, isAmbiguous: false };
    }

    // 1. Files / Invoices / Documents resolution
    const fileEntities = entities.filter(e => e.type === 'file');

    // Check for ambiguity on destructive commands like "delete it" / "remove it"
    const isDestructive = lower.includes('delete') || lower.includes('remove') || lower.includes('purge');
    if (isDestructive && fileEntities.length > 1) {
      // Check if user specified which one
      const matched = fileEntities.filter(f => lower.includes(f.label.toLowerCase()) || lower.includes(f.identifier.toLowerCase()));
      if (matched.length === 1) {
        resolved['target_file'] = matched[0];
      } else {
        return {
          hasReference: true,
          resolved: {},
          isAmbiguous: true,
          ambiguityReason: 'Multiple files exist in context for destructive action.',
          clarificationQuestion: `Alamak, got ${fileEntities.length} files in the current task (${fileEntities.map(f => f.label).join(', ')}). Which one do you want to delete? Let me know ya.`,
        };
      }
    }

    // Check for invoice reference
    if (lower.includes('invoice') || lower.includes('the invoice')) {
      const invoiceFile = fileEntities.find(f => f.label.toLowerCase().includes('invoice') || f.identifier.toLowerCase().includes('inv'));
      if (invoiceFile) {
        resolved['invoice'] = invoiceFile;
        resolved['target_file'] = invoiceFile;
      }
    }

    // Check for "the summary" or "that summary"
    if (lower.includes('summary') || lower.includes('that summary')) {
      const summaryEntity = entities.find(e => e.identifier === 'document_summary' || (e.type === 'document' && e.data?.summaryLines));
      if (summaryEntity) {
        resolved['summary'] = summaryEntity;
      }
    }

    // Generic "it", "that", "this", "the file", "the details", "summarize it"
    if (
      lower.includes('it') ||
      lower.includes('that') ||
      lower.includes('this') ||
      lower.includes('the file') ||
      lower.includes('the document') ||
      lower.includes('details') ||
      lower.includes('summarize')
    ) {
      // If user is asking for summary or email with that summary, check summary first if it exists
      if ((lower.includes('email') || lower.includes('send')) && lower.includes('summary')) {
        const sum = entities.find(e => e.identifier === 'document_summary');
        if (sum) resolved['summary'] = sum;
      }

      // Most recent verified file in active task
      if (!resolved['target_file'] && fileEntities.length > 0) {
        resolved['target_file'] = fileEntities[0];
      }

      // Most recent amount/calculation if asking about amount/result
      if (lower.includes('amount') || lower.includes('result') || lower.includes('calculation')) {
        const amt = entities.find(e => e.type === 'amount');
        if (amt) resolved['amount'] = amt;
      }
    }

    return {
      hasReference: Object.keys(resolved).length > 0,
      resolved,
      isAmbiguous: false,
    };
  }
}
