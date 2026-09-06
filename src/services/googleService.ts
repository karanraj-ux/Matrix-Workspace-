import { AccountToken } from '../types';

export const fetchDriveFiles = async (acc: AccountToken, handleTokenExpiry: (id: string) => void) => {
  if (acc.isExpired) return [];
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1000&fields=files(id,name,mimeType,modifiedTime,webViewLink,webContentLink,iconLink)&q=trashed=false&orderBy=modifiedTime%20desc', {
      headers: { Authorization: `Bearer ${acc.accessToken}` }
    });
    if (res.status === 401) { handleTokenExpiry(acc.id); return []; }
    const data = await res.json();
    return (data.files || []).map((f: any) => ({
      ...f,
      accountId: acc.id,
      accountEmail: acc.email,
      accountPhoto: acc.photoURL,
      timestamp: new Date(f.modifiedTime).getTime()
    }));
  } catch (e) {
    console.error(`Drive fetch failed for ${acc.email}`, e);
    return [];
  }
};

export const fetchGmailMessages = async (acc: AccountToken, handleTokenExpiry: (id: string) => void) => {
  if (acc.isExpired) return [];
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=is:unread%20in:inbox', {
      headers: { Authorization: `Bearer ${acc.accessToken}` }
    });
    if (res.status === 401) { handleTokenExpiry(acc.id); return []; }
    const data = await res.json();
    if (!data.messages) return [];

    const detailPromises = data.messages.map(async (msg: any) => {
      const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, {
        headers: { Authorization: `Bearer ${acc.accessToken}` }
      });
      if (detailRes.status === 401) return null;
      const detail = await detailRes.json();
      const subject = detail.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
      const from = detail.payload?.headers?.find((h: any) => h.name === 'From')?.value || 'Unknown Sender';
      
      return {
        id: msg.id,
        subject,
        from,
        snippet: detail.snippet,
        timestamp: parseInt(detail.internalDate, 10) || Date.now(),
        accountId: acc.id,
        accountEmail: acc.email,
        accountPhoto: acc.photoURL,
        threadId: msg.threadId
      };
    });
    
    const results = await Promise.all(detailPromises);
    return results.filter((r: any) => r !== null);
  } catch (e) {
    console.error(`Gmail fetch failed for ${acc.email}`, e);
    return [];
  }
};

export const fetchCalendarEvents = async (acc: AccountToken, handleTokenExpiry: (id: string) => void) => {
  if (acc.isExpired) return [];
  try {
    const timeMin = new Date().toISOString();
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&maxResults=15&singleEvents=true&orderBy=startTime`, {
      headers: { Authorization: `Bearer ${acc.accessToken}` }
    });
    if (res.status === 401) { handleTokenExpiry(acc.id); return []; }
    const data = await res.json();
    return (data.items || []).map((e: any) => ({
      ...e,
      accountId: acc.id,
      accountEmail: acc.email,
      accountPhoto: acc.photoURL,
      timestamp: new Date(e.start?.dateTime || e.start?.date).getTime()
    }));
  } catch (e) {
    console.error(`Calendar fetch failed for ${acc.email}`, e);
    return [];
  }
};
