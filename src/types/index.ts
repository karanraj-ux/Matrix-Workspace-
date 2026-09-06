export interface AccountToken {
  id: string;
  email: string | null;
  name: string | null;
  photoURL: string | null;
  accessToken: string;
  isExpired?: boolean;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  accountId: string;
  accountEmail: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  webContentLink?: string;
  iconLink?: string;
  accountId: string;
  accountEmail: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  htmlLink: string;
  accountId: string;
  accountEmail: string;
}
