export const encodeBase64Url = (str: string) => {
  const utf8Str = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
      (match, p1) => String.fromCharCode(parseInt(p1, 16)));
  const base64 = btoa(utf8Str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

interface MimeParams {
  to: string;
  from: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}

export const createMimeMessage = ({ to, from, subject, body, inReplyTo, references }: MimeParams) => {
  const headers = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
  ];

  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
  }
  if (references) {
    headers.push(`References: ${references}`);
  }

  const message = `${headers.join('\r\n')}\r\n\r\n${body}`;
  return encodeBase64Url(message);
};
