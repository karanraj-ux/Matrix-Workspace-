/**
 * Unified Multi-Cloud Email Service
 * Seamlessly integrates Gmail and Microsoft Outlook (Graph API)
 * into a single unified chronological timeline.
 */

import { AccountToken, GmailMessage } from '../types';
import { ensureValidToken } from './multiCloudAdapter';
import { fetchGmailMessages, sendEmail } from './googleService';
import { createMimeMessage } from '../utils/emailUtils';

// Helper to base64url decode
function decodeBase64(str: string) {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    return '';
  }
}

function extractEmailBody(payload: any): string {
  if (!payload) return '';
  let html = '';
  let text = '';

  if (payload.mimeType === 'text/html' && payload.body?.data) {
    html = decodeBase64(payload.body.data);
  } else if (payload.mimeType === 'text/plain' && payload.body?.data) {
    text = decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    payload.parts.forEach((part: any) => {
      if (part.mimeType === 'text/html' && part.body?.data) html = decodeBase64(part.body.data);
      if (part.mimeType === 'text/plain' && part.body?.data) text = decodeBase64(part.body.data);
      if (part.parts) {
        part.parts.forEach((subPart: any) => {
          if (subPart.mimeType === 'text/html' && subPart.body?.data) html = decodeBase64(subPart.body.data);
          if (subPart.mimeType === 'text/plain' && subPart.body?.data) text = decodeBase64(subPart.body.data);
        });
      }
    });
  }
  return html || `<div style="white-space: pre-wrap; font-family: sans-serif; padding: 16px; color: #333;">${text}</div>`;
}

function extractAttachments(payload: any): { attachmentId: string; filename: string; mimeType: string; size: number }[] {
  const attachments: { attachmentId: string; filename: string; mimeType: string; size: number }[] = [];
  if (!payload) return attachments;

  const traverse = (parts: any[]) => {
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size || 0,
        });
      }
      if (part.parts) traverse(part.parts);
    }
  };

  if (payload.parts) traverse(payload.parts);
  return attachments;
}

/**
 * Fetch messages from either Gmail or Microsoft Outlook based on account provider.
 */
export const fetchUnifiedEmails = async (
  acc: AccountToken,
  handleTokenExpiry: (id: string) => void
): Promise<GmailMessage[]> => {
  if (acc.isExpired) return [];
  const provider = acc.provider || 'google';

  if (provider === 'onedrive') {
    // Microsoft Outlook via Microsoft Graph API
    await ensureValidToken(acc);
    try {
      const url =
        'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime%20desc&$select=id,conversationId,subject,from,bodyPreview,receivedDateTime,hasAttachments,isRead';
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${acc.accessToken}` },
      });

      if (res.status === 401) {
        handleTokenExpiry(acc.id);
        return [];
      }
      if (!res.ok) {
        console.warn(`Outlook fetch failed (${res.status}): ${res.statusText}`);
        return [];
      }

      const data = await res.json();
      const messages = (data.value || []).map((msg: any) => {
        const fromAddr = msg.from?.emailAddress?.address || 'Unknown';
        const fromName = msg.from?.emailAddress?.name;
        const fromStr = fromName ? `${fromName} <${fromAddr}>` : fromAddr;
        const timestamp = new Date(msg.receivedDateTime).getTime() || Date.now();

        return {
          id: msg.id,
          threadId: msg.conversationId || msg.id,
          subject: msg.subject || '(No Subject)',
          from: fromStr,
          snippet: msg.bodyPreview || '',
          date: msg.receivedDateTime,
          accountId: acc.id,
          accountEmail: acc.email,
          accountPhoto: acc.photoURL,
          timestamp,
          messageId: msg.id,
          provider: 'onedrive' as const,
        };
      });

      return messages;
    } catch (e) {
      console.error(`Outlook mail fetch failed for ${acc.email}:`, e);
      return [];
    }
  } else if (provider === 'google') {
    // Gmail via Google REST API
    return await fetchGmailMessages(acc, handleTokenExpiry);
  }

  // Dropbox has no email capability
  return [];
};

/**
 * Load full content and attachments for a specific email.
 */
export const fetchUnifiedEmailContent = async (
  account: AccountToken,
  email: GmailMessage
): Promise<{ content: string; attachments: any[] }> => {
  await ensureValidToken(account);
  const provider = account.provider || 'google';

  if (provider === 'onedrive') {
    // Fetch Microsoft Outlook message body
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${email.id}?$select=body,hasAttachments`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    if (!res.ok) throw new Error(`Failed to load Outlook email (${res.status}): ${res.statusText}`);
    const data = await res.json();
    const content = data.body?.content || `<div style="padding:16px;">${email.snippet}</div>`;

    let attachments: any[] = [];
    if (data.hasAttachments) {
      try {
        const attRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${email.id}/attachments`, {
          headers: { Authorization: `Bearer ${account.accessToken}` },
        });
        if (attRes.ok) {
          const attData = await attRes.json();
          attachments = (attData.value || []).map((a: any) => ({
            attachmentId: a.id,
            filename: a.name,
            mimeType: a.contentType || 'application/octet-stream',
            size: a.size || 0,
          }));
        }
      } catch (attErr) {
        console.warn('Could not load Outlook attachments:', attErr);
      }
    }

    return { content, attachments };
  } else {
    // Google Gmail
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${email.id}?format=full`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    if (!res.ok) throw new Error(`Failed to load Gmail email (${res.status}): ${res.statusText}`);
    const data = await res.json();
    const content = extractEmailBody(data.payload);
    const attachments = extractAttachments(data.payload);
    return { content, attachments };
  }
};

/**
 * Mark read or archive across Gmail and Outlook.
 */
export const executeUnifiedEmailAction = async (
  account: AccountToken,
  email: GmailMessage,
  action: 'read' | 'archive'
): Promise<void> => {
  await ensureValidToken(account);
  const provider = account.provider || 'google';

  if (provider === 'onedrive') {
    if (action === 'read') {
      await fetch(`https://graph.microsoft.com/v1.0/me/messages/${email.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isRead: true }),
      });
    } else if (action === 'archive') {
      // Move to archive folder in Outlook
      const moveRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${email.id}/move`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ destinationId: 'archive' }),
      });
      // Fallback if archive folder is missing: mark as read
      if (!moveRes.ok) {
        await fetch(`https://graph.microsoft.com/v1.0/me/messages/${email.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isRead: true }),
        });
      }
    }
  } else {
    // Google Gmail
    const payload = action === 'read'
      ? { removeLabelIds: ['UNREAD'] }
      : { removeLabelIds: ['UNREAD', 'INBOX'] };
    await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${email.id}/modify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }
};

/**
 * Send an email from either Google (Gmail) or Microsoft (Outlook).
 */
export const sendUnifiedEmail = async (
  account: AccountToken,
  params: {
    to: string;
    subject: string;
    body: string;
    replyToEmail?: GmailMessage | null;
  }
): Promise<void> => {
  await ensureValidToken(account);
  const provider = account.provider || 'google';

  if (provider === 'onedrive') {
    // Microsoft Graph sendMail
    const mailPayload = {
      message: {
        subject: params.subject,
        body: {
          contentType: 'HTML',
          content: params.body,
        },
        toRecipients: [
          {
            emailAddress: { address: params.to.trim() },
          },
        ],
      },
      saveToSentItems: true,
    };

    const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mailPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Outlook sendMail failed (${res.status}): ${errText}`);
    }
  } else {
    // Google Gmail MIME send
    const mimeMessage = createMimeMessage({
      to: params.to,
      from: account.email || '',
      subject: params.subject,
      body: params.body,
      inReplyTo: params.replyToEmail?.messageId,
      references: params.replyToEmail?.references,
    });

    await sendEmail(account.accessToken, mimeMessage, params.replyToEmail?.threadId);
  }
};
