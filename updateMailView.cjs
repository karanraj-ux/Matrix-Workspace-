const fs = require('fs');
let view = fs.readFileSync('src/views/MailView.tsx', 'utf8');

view = view.replace(
  `import { Mail, MailOpen, Archive, CheckSquare, Reply, X, Loader2, ArrowLeft } from 'lucide-react';`,
  `import { Mail, MailOpen, Archive, CheckSquare, Reply, X, Loader2, ArrowLeft, Zap } from 'lucide-react';`
);

view = view.replace(
  `onSaveAttachmentToDrive: (\n    email: GmailMessage,\n    attachment: { attachmentId: string; filename: string; mimeType: string; size: number }\n  ) => void;`,
  `onSaveAttachmentToDrive: (\n    email: GmailMessage,\n    attachment: { attachmentId: string; filename: string; mimeType: string; size: number }\n  ) => void;\n  onAutomateSender?: (email: GmailMessage) => void;`
);

view = view.replace(
  `  onSaveAttachmentToDrive,\n}) => {`,
  `  onSaveAttachmentToDrive,\n  onAutomateSender,\n}) => {`
);

// Add button in the header
const buttonHtml = `
                {onAutomateSender && (
                  <button
                    onClick={() => onAutomateSender(activeEmail)}
                    className="hidden sm:flex px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-semibold transition-colors items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Automate this sender"
                  >
                    <Zap size={14} />
                    <span>Automate</span>
                  </button>
                )}
`;

view = view.replace(
  `              <div className="flex items-center gap-2 shrink-0">`,
  `              <div className="flex items-center gap-2 shrink-0">\n${buttonHtml}`
);

fs.writeFileSync('src/views/MailView.tsx', view, 'utf8');
console.log('MailView updated');
