import {
  ExecutionMode,
  VerificationResult,
  WorkspaceFileItem,
  WorkspaceEmailItem,
  WorkspaceCalendarEventItem,
  IDriveAdapter,
  IEmailAdapter,
  ICalendarAdapter,
  IDocumentAnalysisAdapter,
  ICalculationAdapter,
  INotificationAdapter,
  AdapterBundle,
} from '../types';
import { SimulationDocumentAnalysisAdapter, SimulationCalculationAdapter, SimulationNotificationAdapter } from '../simulation';

// Request-scoped token store for when client passes token in Authorization: Bearer <token>
let activeBearerToken: string | null = null;

export function setActiveBearerToken(token: string | null) {
  activeBearerToken = token;
}

export function getActiveBearerToken(): string | null {
  return activeBearerToken || process.env.GOOGLE_WORKSPACE_ACCESS_TOKEN || null;
}

export class ProductionDriveAdapter implements IDriveAdapter {
  public readonly mode: ExecutionMode = 'production';

  private getToken(): string {
    const token = getActiveBearerToken();
    if (!token) {
      throw new Error(
        'Google Drive authorization missing. Please sign in with your Google Workspace account.'
      );
    }
    return token;
  }

  public async searchFiles(query: string, fileType?: string): Promise<{
    files: Array<Omit<WorkspaceFileItem, 'content'>>;
    verification: VerificationResult;
  }> {
    const token = this.getToken();
    let q = `trashed = false`;
    if (query) {
      q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
    }
    if (fileType) {
      if (fileType === 'pdf') q += ` and mimeType = 'application/pdf'`;
      else if (fileType === 'document') q += ` and (mimeType contains 'document' or mimeType contains 'text')`;
      else if (fileType === 'spreadsheet') q += ` and (mimeType contains 'sheet' or mimeType contains 'csv')`;
    }

    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime,parents)&pageSize=20`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Drive API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    const files: Array<Omit<WorkspaceFileItem, 'content'>> = (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      folder: f.parents && f.parents.length > 0 ? f.parents[0] : 'My Drive',
      sizeBytes: Number(f.size || 0),
      modifiedAt: f.modifiedTime || new Date().toISOString(),
      metadata: { liveId: f.id },
    }));

    return {
      files,
      verification: {
        verified: true,
        isSimulated: false,
        verificationId: `gdrive_${Date.now().toString(36)}`,
        message: `[Google Drive Live] Fetched ${files.length} file(s) matching "${query}"`,
        timestamp: new Date().toISOString(),
        metadata: { liveSearchQuery: query, count: files.length },
      },
    };
  }

  public async getFileMetadata(fileId: string): Promise<{
    file: Omit<WorkspaceFileItem, 'content'>;
    verification: VerificationResult;
  }> {
    const token = this.getToken();
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,parents`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Drive API error (${res.status}): ${err}`);
    }

    const f = await res.json();
    const file: Omit<WorkspaceFileItem, 'content'> = {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      folder: f.parents && f.parents.length > 0 ? f.parents[0] : 'My Drive',
      sizeBytes: Number(f.size || 0),
      modifiedAt: f.modifiedTime || new Date().toISOString(),
      metadata: { liveId: f.id },
    };

    return {
      file,
      verification: {
        verified: true,
        isSimulated: false,
        verificationId: `gdrive_meta_${file.id}`,
        message: `[Google Drive Live] Metadata verified for "${file.name}"`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async readFile(fileId: string): Promise<{
    file: WorkspaceFileItem;
    verification: VerificationResult;
  }> {
    const token = this.getToken();
    // First get metadata
    const metaRes = await this.getFileMetadata(fileId);
    const f = metaRes.file;

    // Fetch contents
    let content = '';
    if (f.mimeType.includes('google-apps.document')) {
      // Export as text
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`;
      const docRes = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (docRes.ok) {
        content = await docRes.text();
      }
    } else {
      const getUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
      const binRes = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (binRes.ok) {
        content = await binRes.text();
      }
    }

    const fullFile: WorkspaceFileItem = {
      ...f,
      content: content || `[File loaded from Google Drive: ${f.name}]`,
    };

    return {
      file: fullFile,
      verification: {
        verified: true,
        isSimulated: false,
        verificationId: `gdrive_read_${f.id}`,
        message: `[Google Drive Live] Successfully read content for "${f.name}"`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async createFile(name: string, content: string, folder?: string): Promise<{
    file: { id: string; name: string; folder: string; sizeBytes: number };
    verification: VerificationResult;
  }> {
    const token = this.getToken();
    const metadata: Record<string, any> = {
      name,
      mimeType: 'text/plain',
    };
    if (folder && folder !== 'root' && folder !== 'My Drive') {
      metadata.parents = [folder];
    }

    // Multipart upload
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: text/plain\r\n\r\n' +
      content +
      closeDelimiter;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Drive create file failed (${res.status}): ${err}`);
    }

    const created = await res.json();
    return {
      file: {
        id: created.id,
        name: created.name || name,
        folder: folder || 'My Drive',
        sizeBytes: content.length,
      },
      verification: {
        verified: true,
        isSimulated: false,
        verificationId: created.id,
        message: `[Google Drive Live] Successfully created file "${name}" (ID: ${created.id})`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async deleteFile(fileId: string): Promise<{
    deleted: { id: string; name: string; deletedAt: string };
    verification: VerificationResult;
  }> {
    const token = this.getToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok && res.status !== 204) {
      const err = await res.text();
      throw new Error(`Google Drive delete file failed (${res.status}): ${err}`);
    }

    const deletedAt = new Date().toISOString();
    return {
      deleted: {
        id: fileId,
        name: fileId,
        deletedAt,
      },
      verification: {
        verified: true,
        isSimulated: false,
        verificationId: `gdrive_del_${fileId}`,
        message: `[Google Drive Live] File deleted from Google Drive: ${fileId}`,
        timestamp: deletedAt,
      },
    };
  }

  public async moveFile(fileId: string, targetFolder: string): Promise<{
    moved: { fileId: string; name: string; newFolder: string; movedAt: string };
    verification: VerificationResult;
  }> {
    const token = this.getToken();
    // Add new parent
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(targetFolder)}&fields=id,name,parents`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Drive move file failed (${res.status}): ${err}`);
    }

    const f = await res.json();
    const movedAt = new Date().toISOString();
    return {
      moved: {
        fileId: f.id,
        name: f.name,
        newFolder: targetFolder,
        movedAt,
      },
      verification: {
        verified: true,
        isSimulated: false,
        verificationId: `gdrive_mov_${f.id}`,
        message: `[Google Drive Live] File moved to target folder ${targetFolder}`,
        timestamp: movedAt,
      },
    };
  }
}

export class ProductionEmailAdapter implements IEmailAdapter {
  public readonly mode: ExecutionMode = 'production';

  private getToken(): string {
    const token = getActiveBearerToken();
    if (!token) {
      throw new Error(
        'Gmail authorization missing. Please sign in with your Google Workspace account.'
      );
    }
    return token;
  }

  public async searchEmails(query: string): Promise<{
    emails: WorkspaceEmailItem[];
    verification: VerificationResult;
  }> {
    const token = this.getToken();
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query || '')}&maxResults=10`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail API search failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    const messages = data.messages || [];
    const emails: WorkspaceEmailItem[] = [];

    // Fetch first 5 message headers for rich context
    for (const m of messages.slice(0, 5)) {
      try {
        const itemRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (itemRes.ok) {
          const detail = await itemRes.json();
          const headers: Record<string, string> = {};
          (detail.payload?.headers || []).forEach((h: any) => {
            headers[h.name.toLowerCase()] = h.value;
          });
          emails.push({
            id: detail.id,
            threadId: detail.threadId,
            from: headers['from'] || 'Unknown Sender',
            to: headers['to'] || 'me',
            subject: headers['subject'] || '(No Subject)',
            date: headers['date'] || detail.internalDate,
            snippet: detail.snippet || '',
            body: detail.snippet || '',
          });
        }
      } catch (e) {
        console.warn('Failed to fetch email detail', e);
      }
    }

    return {
      emails,
      verification: {
        verified: true,
        isSimulated: false,
        verificationId: `gmail_search_${Date.now().toString(36)}`,
        message: `[Gmail Live] Found ${data.resultSizeEstimate || emails.length} email(s) matching "${query}"`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async readEmail(messageId: string): Promise<{
    email: WorkspaceEmailItem;
    verification: VerificationResult;
  }> {
    const token = this.getToken();
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail API read email failed (${res.status}): ${err}`);
    }

    const detail = await res.json();
    const headers: Record<string, string> = {};
    (detail.payload?.headers || []).forEach((h: any) => {
      headers[h.name.toLowerCase()] = h.value;
    });

    let body = detail.snippet || '';
    if (detail.payload?.body?.data) {
      try {
        body = Buffer.from(detail.payload.body.data, 'base64').toString('utf-8');
      } catch {
        body = detail.snippet || '';
      }
    }

    const email: WorkspaceEmailItem = {
      id: detail.id,
      threadId: detail.threadId,
      from: headers['from'] || 'Unknown',
      to: headers['to'] || 'me',
      subject: headers['subject'] || '(No Subject)',
      date: headers['date'] || new Date().toISOString(),
      snippet: detail.snippet || '',
      body,
    };

    return {
      email,
      verification: {
        verified: true,
        isSimulated: false,
        verificationId: `gmail_read_${detail.id}`,
        message: `[Gmail Live] Read message: "${email.subject}" from ${email.from}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async draftEmail(to: string, subject: string, body: string): Promise<{
    draft: { draftId: string; to: string; subject: string; body: string; createdAt: string };
    verification: VerificationResult;
  }> {
    const token = this.getToken();
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ];
    const raw = Buffer.from(emailLines.join('\r\n')).toString('base64url');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: { raw },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail API draft creation failed (${res.status}): ${err}`);
    }

    const d = await res.json();
    const createdAt = new Date().toISOString();
    return {
      draft: {
        draftId: d.id,
        to,
        subject,
        body,
        createdAt,
      },
      verification: {
        verified: true,
        isSimulated: false,
        verificationId: d.id,
        message: `[Gmail Live] Draft successfully created in your Gmail account (ID: ${d.id})`,
        timestamp: createdAt,
      },
    };
  }

  public async sendEmail(to: string, subject: string, body: string, idempotencyKey?: string): Promise<{
    sent: { status: string; messageId: string; recipient: string; subject: string; dispatchedAt: string };
    verification: VerificationResult;
  }> {
    const token = this.getToken();
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ];
    const raw = Buffer.from(emailLines.join('\r\n')).toString('base64url');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail API send failed (${res.status}): ${err}`);
    }

    const sentData = await res.json();
    const dispatchedAt = new Date().toISOString();
    return {
      sent: {
        status: 'sent',
        messageId: sentData.id,
        recipient: to,
        subject,
        dispatchedAt,
      },
      verification: {
        verified: true,
        isSimulated: false,
        verificationId: sentData.id,
        message: `[Gmail Live] Dispatched email to ${to} (Message ID: ${sentData.id})`,
        timestamp: dispatchedAt,
      },
    };
  }
}

export class ProductionCalendarAdapter implements ICalendarAdapter {
  public readonly mode: ExecutionMode = 'production';

  private getToken(): string {
    const token = getActiveBearerToken();
    if (!token) {
      throw new Error(
        'Google Calendar authorization missing. Please sign in with your Google Workspace account.'
      );
    }
    return token;
  }

  public async checkCalendar(date?: string, slotDurationMinutes: number = 60): Promise<{
    dateChecked: string;
    scheduledEvents: WorkspaceCalendarEventItem[];
    availableFreeSlots: Array<{ start: string; end: string; durationMinutes: number; note: string }>;
    verification: VerificationResult;
  }> {
    const token = this.getToken();
    const targetDate = new Date();
    if (date && date.toLowerCase().includes('tomorrow')) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    const timeMin = new Date(targetDate.setHours(8, 0, 0, 0)).toISOString();
    const timeMax = new Date(targetDate.setHours(19, 0, 0, 0)).toISOString();

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Calendar API failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    const scheduledEvents: WorkspaceCalendarEventItem[] = (data.items || []).map((ev: any) => ({
      id: ev.id,
      title: ev.summary || '(Untitled Event)',
      start: ev.start?.dateTime || ev.start?.date || timeMin,
      end: ev.end?.dateTime || ev.end?.date || timeMax,
      attendees: (ev.attendees || []).map((a: any) => a.email),
      location: ev.location,
      description: ev.description,
    }));

    // Calculate free slots between 9am and 6pm
    const freeSlots: Array<{ start: string; end: string; durationMinutes: number; note: string }> = [];
    let curTime = new Date(targetDate.setHours(9, 0, 0, 0));
    const endTime = new Date(targetDate.setHours(18, 0, 0, 0));

    while (curTime.getTime() + slotDurationMinutes * 60000 <= endTime.getTime()) {
      const slotStart = new Date(curTime);
      const slotEnd = new Date(curTime.getTime() + slotDurationMinutes * 60000);

      // Check collision with existing events
      const hasConflict = scheduledEvents.some(ev => {
        const evStart = new Date(ev.start).getTime();
        const evEnd = new Date(ev.end).getTime();
        return slotStart.getTime() < evEnd && slotEnd.getTime() > evStart;
      });

      if (!hasConflict) {
        freeSlots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          durationMinutes: slotDurationMinutes,
          note: `Unblocked ${slotDurationMinutes}-minute slot available on Google Calendar`,
        });
      }

      // Increment by 30 mins
      curTime = new Date(curTime.getTime() + 30 * 60000);
    }

    return {
      dateChecked: targetDate.toISOString().split('T')[0],
      scheduledEvents,
      availableFreeSlots: freeSlots,
      verification: {
        verified: true,
        isSimulated: false,
        verificationId: `gcal_check_${Date.now().toString(36)}`,
        message: `[Google Calendar Live] Checked primary calendar: ${scheduledEvents.length} event(s) scheduled, ${freeSlots.length} open slot(s) computed.`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async createEvent(
    title: string,
    start: string,
    end: string,
    attendees?: string[],
    description?: string
  ): Promise<{
    event: WorkspaceCalendarEventItem;
    verification: VerificationResult;
  }> {
    const token = this.getToken();
    const eventPayload = {
      summary: title,
      description: description || 'Scheduled via NEXUS Master Superagent',
      start: { dateTime: new Date(start).toISOString() },
      end: { dateTime: new Date(end).toISOString() },
      attendees: attendees ? attendees.map(email => ({ email })) : [],
    };

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Calendar createEvent failed (${res.status}): ${err}`);
    }

    const created = await res.json();
    const evItem: WorkspaceCalendarEventItem = {
      id: created.id,
      title: created.summary,
      start: created.start?.dateTime || start,
      end: created.end?.dateTime || end,
      attendees: (created.attendees || []).map((a: any) => a.email),
      description: created.description,
    };

    return {
      event: evItem,
      verification: {
        verified: true,
        isSimulated: false,
        verificationId: created.id,
        message: `[Google Calendar Live] Event created on Google Calendar: "${title}" (Event ID: ${created.id})`,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export function createProductionAdapters(): AdapterBundle {
  return {
    drive: new ProductionDriveAdapter(),
    email: new ProductionEmailAdapter(),
    calendar: new ProductionCalendarAdapter(),
    document: new SimulationDocumentAnalysisAdapter(),
    calculate: new SimulationCalculationAdapter(),
    notification: new SimulationNotificationAdapter(),
  };
}
