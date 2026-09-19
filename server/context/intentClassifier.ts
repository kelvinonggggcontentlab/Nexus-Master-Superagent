import { ContextualIntentType, ActiveTaskContext, ContextEntity } from './types';
import { NexusMessage } from '../../src/types/nexus';

export interface IntentClassificationResult {
  intent: ContextualIntentType;
  confidence: number;
  reason: string;
  suggestedAction?: string;
  modifiedParameters?: Record<string, any>;
}

export class IntentClassifier {
  public static classify(
    userText: string,
    activeTask: ActiveTaskContext | null,
    recentMessages: NexusMessage[],
    resolvedReferences: Record<string, ContextEntity>
  ): IntentClassificationResult {
    const lower = userText.toLowerCase().trim();

    // 1. Cancellation Detection
    if (
      lower === 'stop' ||
      lower === 'cancel' ||
      lower === 'cancel that' ||
      lower === 'abort' ||
      lower === 'never mind' ||
      lower.startsWith('stop ') ||
      lower.startsWith("don't send") ||
      lower.startsWith('dont send') ||
      lower.startsWith("don't do that") ||
      lower.includes('abort the task') ||
      lower.includes('cancel the task')
    ) {
      return {
        intent: 'CANCEL_TASK',
        confidence: 0.98,
        reason: 'User explicitly commanded task cancellation or halt.',
      };
    }

    // 2. Task Modification Detection
    // e.g. "Wait, don't send it yet. Just prepare the email", "Actually send it to my work email instead", "Change recipient to ..."
    const isModification =
      lower.startsWith('wait,') ||
      lower.includes('instead') ||
      lower.startsWith('actually') ||
      lower.includes('just prepare') ||
      lower.includes('change it to') ||
      lower.includes('change recipient');

    if (isModification && activeTask) {
      const modifiedParams: Record<string, any> = {};

      // Check if user changed email/recipient
      const emailMatch = userText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        modifiedParams.recipient = emailMatch[1];
      } else {
        const nameMatch = userText.match(/(?:to|instead of\s+[A-Za-z]+,\s+to)\s+([A-Za-z]+)/i);
        if (nameMatch && !['the', 'my'].includes(nameMatch[1].toLowerCase())) {
          modifiedParams.recipient = `${nameMatch[1].toLowerCase()}@example.com`;
        }
      }

      // Check if user asked to stop before sending (e.g. "Just prepare the email", "Don't send it yet")
      if (lower.includes('just prepare') || lower.includes("don't send it yet") || lower.includes('dont send')) {
        modifiedParams.preventSend = true;
      }

      return {
        intent: 'MODIFY_TASK',
        confidence: 0.95,
        reason: 'User provided updated constraints or parameters to active task.',
        modifiedParameters: modifiedParams,
      };
    }

    // 3. Query of Existing Results (Without re-running tools)
    // e.g. "Show me the details", "When was it received?", "What was the amount?", "What was the total?", "Who was it from?"
    const isQueryResult =
      lower === 'show me the details' ||
      lower === 'details' ||
      lower.startsWith('show me the details') ||
      lower.startsWith('what was the amount') ||
      lower.startsWith('what is the amount') ||
      lower.startsWith('what was the total') ||
      lower.startsWith('what is the total') ||
      lower.startsWith('when was it received') ||
      lower.startsWith('what date') ||
      lower.startsWith('who is the vendor') ||
      lower.startsWith('what is the invoice number');

    if (isQueryResult && (activeTask || Object.keys(resolvedReferences).length > 0)) {
      return {
        intent: 'QUERY_RESULT',
        confidence: 0.95,
        reason: 'User is querying details from already verified tool results.',
      };
    }

    // 4. Continuation of Existing Task
    // e.g. "Summarize it", "Prepare an email with that summary", "Now email it to Kelvin", "Send that", "Move it to /Archive"
    const hasReference = Object.keys(resolvedReferences).length > 0;
    const isContinuationWord =
      lower.startsWith('summarize') ||
      lower.startsWith('prepare an email') ||
      lower.startsWith('now ') ||
      lower.startsWith('then ') ||
      lower.startsWith('email that') ||
      lower.startsWith('send that') ||
      lower.startsWith('move it') ||
      lower.startsWith('delete it') ||
      lower === 'continue';

    if ((hasReference || isContinuationWord) && activeTask) {
      return {
        intent: 'CONTINUE_TASK',
        confidence: 0.9,
        reason: 'User is directing the next phase of the active workflow using existing context.',
      };
    }

    // 5. General Conversation
    if (['hello', 'hi', 'hey', 'thanks', 'thank you'].includes(lower)) {
      return {
        intent: 'GENERAL_CONVERSATION',
        confidence: 0.95,
        reason: 'Conversational pleasantry or greeting.',
      };
    }

    // 6. Default to NEW_TASK
    return {
      intent: 'NEW_TASK',
      confidence: 0.85,
      reason: 'User initiated a distinct task objective.',
    };
  }
}
