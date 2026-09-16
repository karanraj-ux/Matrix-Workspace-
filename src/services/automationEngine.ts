import { get, set } from 'idb-keyval';
import { AccountToken } from '../types';
import { AutomationRule, AutomationLog } from '../types/automation';

const addLog = async (log: Omit<AutomationLog, 'id' | 'timestamp'>): Promise<AutomationLog> => {
  const logs = (await get<AutomationLog[]>('matrix_automation_logs')) || [];
  const newLog: AutomationLog = {
    ...log,
    id: Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
  };
  await set('matrix_automation_logs', [newLog, ...logs].slice(0, 100)); // Keep last 100
  return newLog;
};

// Multipart upload for Drive (for attachments)
const uploadToDrive = async (token: string, filename: string, mimeType: string, base64Data: string) => {
  const boundary = '-------314159265358979323846';
  const delimiter = '\r\n--' + boundary + '\r\n';
  const close_delim = '\r\n--' + boundary + '--';

  const metadata = { name: filename, mimeType };
  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' +
    mimeType +
    '\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Data +
    close_delim;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.statusText}`);
};

/**
 * Safely extract readable body content from Gmail message payload
 */
const extractMessageBody = (payload: any): string => {
  if (!payload) return '';

  const decodeData = (dataStr: string) => {
    try {
      const normalized = dataStr.replace(/-/g, '+').replace(/_/g, '/');
      return decodeURIComponent(escape(atob(normalized)));
    } catch {
      try {
        return atob(dataStr.replace(/-/g, '+').replace(/_/g, '/'));
      } catch {
        return '';
      }
    }
  };

  // Direct body
  if (payload.body?.data) {
    return decodeData(payload.body.data);
  }

  // Nested parts
  let bodyText = '';
  const walkParts = (parts: any[]) => {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        bodyText += decodeData(part.body.data) + '\n';
      } else if (part.parts) {
        walkParts(part.parts);
      }
    }
  };

  if (payload.parts) {
    walkParts(payload.parts);
  }

  return bodyText.trim();
};

export const executeAutomations = async (
  rules: AutomationRule[],
  accounts: AccountToken[]
): Promise<{ processedCount: number; newLogs: AutomationLog[] }> => {
  const activeRules = rules.filter(r => r.isActive);
  if (activeRules.length === 0) return { processedCount: 0, newLogs: [] };

  const processed = (await get<Record<string, boolean>>('matrix_processed_items')) || {};
  let processedChanged = false;
  let totalProcessed = 0;
  const createdLogs: AutomationLog[] = [];

  for (const rule of activeRules) {
    const sourceAcc = accounts.find(a => a.id === rule.sourceAccountId);
    if (!sourceAcc || sourceAcc.isExpired) continue;

    if (rule.trigger === 'ON_NEW_EMAIL') {
      try {
        // Fetch latest 10 unread emails
        const listRes = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=is:unread',
          {
            headers: { Authorization: `Bearer ${sourceAcc.accessToken}` },
          }
        );
        if (!listRes.ok) continue;
        const listData = await listRes.json();
        const messages = listData.messages || [];

        for (const msg of messages) {
          const cacheKey = `${rule.id}_${msg.id}`;
          if (processed[cacheKey]) continue; // Already processed by this rule

          // Fetch full message to evaluate conditions & extract text
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
            {
              headers: { Authorization: `Bearer ${sourceAcc.accessToken}` },
            }
          );
          if (!msgRes.ok) continue;
          const msgData = await msgRes.json();

          const headers = msgData.payload?.headers || [];
          const getH = (n: string) =>
            headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || '';
          const subject = getH('Subject');
          const from = getH('From');
          const dateStr = getH('Date') || new Date().toUTCString();

          let hasAttachment = false;
          const searchParts = (parts: any[]) => {
            parts.forEach(part => {
              if (part.filename && part.body?.attachmentId) hasAttachment = true;
              if (part.parts) searchParts(part.parts);
            });
          };
          if (msgData.payload?.parts) searchParts(msgData.payload.parts);

          // Evaluate rule conditions
          let match = true;
          for (const cond of rule.conditions) {
            if (cond.field === 'any_email' || cond.operator === 'always') {
              // Matches all incoming emails unconditionally
              continue;
            } else if (cond.field === 'subject') {
              const val = String(cond.value || '').toLowerCase();
              if (cond.operator === 'contains' && !subject.toLowerCase().includes(val)) match = false;
              if (cond.operator === 'equals' && subject.toLowerCase() !== val) match = false;
            } else if (cond.field === 'from') {
              const val = String(cond.value || '').toLowerCase();
              if (cond.operator === 'contains' && !from.toLowerCase().includes(val)) match = false;
              if (cond.operator === 'equals' && from.toLowerCase() !== val) match = false;
            } else if (cond.field === 'hasAttachment') {
              if (cond.operator === 'is_true' && !hasAttachment) match = false;
            }
          }

          if (match) {
            // Execute actions
            let actionText = '';
            for (const action of rule.actions) {
              if (action.type === 'MARK_AS_READ') {
                await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`,
                  {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${sourceAcc.accessToken}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
                  }
                );
                actionText += 'Marked Read. ';
              } else if (action.type === 'TRASH_EMAIL') {
                await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/trash`,
                  {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${sourceAcc.accessToken}` },
                  }
                );
                actionText += 'Moved to Trash. ';
              } else if (action.type === 'FORWARD_EMAIL' && action.targetEmail) {
                // Extract full body content (or snippet as fallback)
                const fullBody = extractMessageBody(msgData.payload);
                const readableContent = fullBody || msgData.snippet || 'No text content';

                
                const subjectPrefix = '[Matrix Auto-Fwd]';

                const emailMime =
                  `To: ${action.targetEmail}\r\n` +
                  `Subject: ${subjectPrefix} Fwd: ${subject}\r\n` +
                  `Date: ${dateStr}\r\n` +
                  `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
                  `========================================\r\n` +
                  `📬 AUTOMATED MAIL TRANSFER DISPATCH\r\n` +
                  `Source Account: ${sourceAcc.email}\r\n` +
                  `Original Sender: ${from}\r\n` +
                  `Subject: ${subject}\r\n` +
                  `========================================\r\n\r\n` +
                  readableContent;

                const encodedEmail = btoa(unescape(encodeURIComponent(emailMime)))
                  .replace(/\+/g, '-')
                  .replace(/\//g, '_')
                  .replace(/=+$/, '');

                const sendRes = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
                  {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${sourceAcc.accessToken}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ raw: encodedEmail }),
                  }
                );

                if (!sendRes.ok) {
                  const errJson = await sendRes.json().catch(() => ({}));
                  throw new Error(`Forward failed: ${errJson.error?.message || sendRes.statusText}`);
                }

                actionText += `Transferred to ${action.targetEmail}. `;
              } else if (action.type === 'SAVE_ATTACHMENTS_TO_DRIVE' && action.targetAccountId) {
                const targetAcc = accounts.find(a => a.id === action.targetAccountId);
                if (targetAcc && !targetAcc.isExpired) {
                  const attachInfos: any[] = [];
                  const getAttach = (parts: any[]) => {
                    parts.forEach(p => {
                      if (p.filename && p.body?.attachmentId) {
                        attachInfos.push({ id: p.body.attachmentId, name: p.filename, mime: p.mimeType });
                      }
                      if (p.parts) getAttach(p.parts);
                    });
                  };
                  if (msgData.payload?.parts) getAttach(msgData.payload.parts);

                  for (const att of attachInfos) {
                    const attRes = await fetch(
                      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${att.id}`,
                      {
                        headers: { Authorization: `Bearer ${sourceAcc.accessToken}` },
                      }
                    );
                    const attData = await attRes.json();
                    const base64 = (attData.data || '').replace(/-/g, '+').replace(/_/g, '/');
                    await uploadToDrive(targetAcc.accessToken, att.name, att.mime, base64);
                  }
                  actionText += `Saved ${attachInfos.length} attachment(s) to ${targetAcc.email}. `;
                }
              }
            }

            const logged = await addLog({
              ruleName: rule.name,
              actionTaken: actionText || 'Condition met, actions finished.',
              status: 'success',
              accountEmail: sourceAcc.email || undefined,
              details: `Email: "${subject}" from ${from}`,
            });
            createdLogs.push(logged);
            totalProcessed++;
          }

          // Mark processed
          processed[cacheKey] = true;
          processedChanged = true;
        }
      } catch (e: any) {
        console.error('Automation execution error:', e);
        const logged = await addLog({
          ruleName: rule.name,
          actionTaken: 'Execution error',
          status: 'error',
          accountEmail: sourceAcc.email || undefined,
          details: e.message,
        });
        createdLogs.push(logged);
      }
    }
  }

  if (processedChanged) {
    await set('matrix_processed_items', processed);
  }

  return { processedCount: totalProcessed, newLogs: createdLogs };
};
