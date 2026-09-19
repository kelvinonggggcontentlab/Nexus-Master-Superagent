import { ContextEntity, ContextEntityType } from './types';

export class EntityExtractor {
  public static extractFromText(
    text: string,
    conversationId: string,
    taskId?: string
  ): ContextEntity[] {
    const entities: ContextEntity[] = [];
    const now = new Date().toISOString();

    // 1. Email addresses -> recipient
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    let emailMatch;
    while ((emailMatch = emailRegex.exec(text)) !== null) {
      entities.push({
        id: `ent_email_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`,
        type: 'recipient',
        identifier: emailMatch[1],
        label: emailMatch[1],
        source: 'user_prompt',
        confidence: 0.95,
        conversationId,
        taskId,
        updatedAt: now,
      });
    }

    // 2. Monetary amounts -> amount
    const amountRegex = /(?:MYR|USD|EUR|GBP|\$)\s*([\d,]+(?:\.\d{2})?)/gi;
    let amountMatch;
    while ((amountMatch = amountRegex.exec(text)) !== null) {
      entities.push({
        id: `ent_amt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`,
        type: 'amount',
        identifier: amountMatch[0],
        label: amountMatch[0],
        source: 'user_prompt',
        confidence: 0.9,
        conversationId,
        taskId,
        updatedAt: now,
      });
    }

    // 3. Folders -> folder
    const folderRegex = /(?:^|\s)(\/(?:[A-Za-z0-9_.-]+\/?)+)/g;
    let folderMatch;
    while ((folderMatch = folderRegex.exec(text)) !== null) {
      entities.push({
        id: `ent_fld_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`,
        type: 'folder',
        identifier: folderMatch[1].trim(),
        label: folderMatch[1].trim(),
        source: 'user_prompt',
        confidence: 0.85,
        conversationId,
        taskId,
        updatedAt: now,
      });
    }

    // 4. Specific files mentioned by name -> file
    const fileRegex = /([a-zA-Z0-9_\-.]+\.(?:pdf|txt|docx|xlsx|csv|json))/gi;
    let fileMatch;
    while ((fileMatch = fileRegex.exec(text)) !== null) {
      entities.push({
        id: `ent_file_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`,
        type: 'file',
        identifier: fileMatch[1],
        label: fileMatch[1],
        source: 'user_prompt',
        confidence: 0.9,
        conversationId,
        taskId,
        updatedAt: now,
      });
    }

    // 5. Named person
    const personRegex = /(?:email|send to|with|for)\s+([A-Z][a-z]+)/g;
    let personMatch;
    while ((personMatch = personRegex.exec(text)) !== null) {
      const name = personMatch[1];
      if (!['The', 'A', 'An', 'My', 'Our'].includes(name)) {
        entities.push({
          id: `ent_person_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`,
          type: 'person',
          identifier: name.toLowerCase(),
          label: name,
          source: 'user_prompt',
          confidence: 0.8,
          conversationId,
          taskId,
          updatedAt: now,
        });
      }
    }

    return entities;
  }

  public static extractFromToolResult(
    toolName: string,
    result: any,
    conversationId: string,
    taskId?: string,
    isSimulated: boolean = false
  ): ContextEntity[] {
    const entities: ContextEntity[] = [];
    const now = new Date().toISOString();
    if (!result) return entities;

    // 1. search_drive result
    if (toolName === 'search_drive' && result.files && Array.isArray(result.files)) {
      for (const file of result.files) {
        entities.push({
          id: `ent_f_${file.id}`,
          type: 'file',
          identifier: file.id,
          label: file.name,
          source: 'google_drive',
          confidence: 1.0,
          conversationId,
          taskId,
          data: file,
          verified: true,
          isSimulated,
          updatedAt: now,
        });

        // Also if file has metadata with invoice number / total, extract those
        if (file.metadata?.invoiceNumber) {
          entities.push({
            id: `ent_inv_${file.id}`,
            type: 'document',
            identifier: file.metadata.invoiceNumber,
            label: `Invoice ${file.metadata.invoiceNumber}`,
            source: 'google_drive',
            confidence: 1.0,
            conversationId,
            taskId,
            data: { fileId: file.id, ...file.metadata },
            verified: true,
            isSimulated,
            updatedAt: now,
          });
        }
        if (file.metadata?.total) {
          entities.push({
            id: `ent_amt_${file.id}`,
            type: 'amount',
            identifier: file.metadata.total,
            label: file.metadata.total,
            source: 'google_drive',
            confidence: 1.0,
            conversationId,
            taskId,
            verified: true,
            isSimulated,
            updatedAt: now,
          });
        }
      }
    }

    // 2. read_drive_file result
    if (toolName === 'read_drive_file' && result.content) {
      entities.push({
        id: `ent_f_${result.id || 'doc'}`,
        type: 'file',
        identifier: result.id,
        label: result.name || 'Drive Document',
        source: 'google_drive',
        confidence: 1.0,
        conversationId,
        taskId,
        data: result,
        verified: true,
        isSimulated,
        updatedAt: now,
      });

      entities.push({
        id: `ent_content_${result.id || 'doc'}`,
        type: 'document',
        identifier: result.id,
        label: `Content of ${result.name || 'Document'}`,
        source: 'google_drive',
        confidence: 1.0,
        conversationId,
        taskId,
        data: { text: result.content },
        verified: true,
        isSimulated,
        updatedAt: now,
      });
    }

    // 3. analyze_document result
    if (toolName === 'analyze_document' && result.extractedEntities) {
      const { monetaryValues, dates, invoiceNumbers, emails } = result.extractedEntities;

      if (monetaryValues && Array.isArray(monetaryValues)) {
        for (const amt of monetaryValues) {
          entities.push({
            id: `ent_amt_${Math.random().toString(36).substring(2, 6)}`,
            type: 'amount',
            identifier: amt,
            label: amt,
            source: 'analysis',
            confidence: 0.95,
            conversationId,
            taskId,
            verified: true,
            isSimulated,
            updatedAt: now,
          });
        }
      }

      if (dates && Array.isArray(dates)) {
        for (const d of dates) {
          entities.push({
            id: `ent_date_${Math.random().toString(36).substring(2, 6)}`,
            type: 'date',
            identifier: d,
            label: d,
            source: 'analysis',
            confidence: 0.95,
            conversationId,
            taskId,
            verified: true,
            isSimulated,
            updatedAt: now,
          });
        }
      }

      if (invoiceNumbers && Array.isArray(invoiceNumbers)) {
        for (const inv of invoiceNumbers) {
          entities.push({
            id: `ent_inv_${Math.random().toString(36).substring(2, 6)}`,
            type: 'document',
            identifier: inv,
            label: `Invoice Reference ${inv}`,
            source: 'analysis',
            confidence: 0.95,
            conversationId,
            taskId,
            verified: true,
            isSimulated,
            updatedAt: now,
          });
        }
      }

      if (result.summaryLines) {
        entities.push({
          id: `ent_summary_${Date.now().toString(36)}`,
          type: 'document',
          identifier: 'document_summary',
          label: 'Document Summary',
          source: 'analysis',
          confidence: 1.0,
          conversationId,
          taskId,
          data: { summaryLines: result.summaryLines },
          verified: true,
          isSimulated,
          updatedAt: now,
        });
      }
    }

    // 4. calculate result
    if (toolName === 'calculate' && result.formattedResult) {
      entities.push({
        id: `ent_calc_${Date.now().toString(36)}`,
        type: 'amount',
        identifier: result.formattedResult,
        label: `Calculated Result: ${result.formattedResult}`,
        source: 'calculator',
        confidence: 1.0,
        conversationId,
        taskId,
        data: result,
        verified: true,
        isSimulated,
        updatedAt: now,
      });
    }

    // 5. send_email result
    if (toolName === 'send_email' && result.recipient) {
      entities.push({
        id: `ent_sent_${Date.now().toString(36)}`,
        type: 'email',
        identifier: result.messageId || 'sent_email',
        label: `Email to ${result.recipient}`,
        source: 'gmail',
        confidence: 1.0,
        conversationId,
        taskId,
        data: result,
        verified: true,
        isSimulated,
        updatedAt: now,
      });
    }

    // 6. check_calendar result
    if (toolName === 'check_calendar' && result.availableFreeSlots) {
      for (const slot of result.availableFreeSlots) {
        entities.push({
          id: `ent_slot_${Math.random().toString(36).substring(2, 6)}`,
          type: 'calendar_event',
          identifier: `${result.dateChecked}_${slot.start}-${slot.end}`,
          label: `Available Slot: ${slot.start} - ${slot.end} (${slot.note})`,
          source: 'calendar',
          confidence: 0.95,
          conversationId,
          taskId,
          data: slot,
          verified: true,
          isSimulated,
          updatedAt: now,
        });
      }
    }

    return entities;
  }
}
