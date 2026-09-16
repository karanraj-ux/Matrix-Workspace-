const fs = require('fs');

let drive = fs.readFileSync('src/views/DriveView.tsx', 'utf8');
const newActions = `
                      <div className="flex items-center gap-2">
                        {onAttachToEmail && (
                          <button
                            onClick={() => onAttachToEmail(file)}
                            className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition-colors flex items-center gap-1"
                          >
                            <Mail size={12} /> Attach
                          </button>
                        )}
                        {setTransferFile && (
                          <button
                            onClick={() => setTransferFile(file)}
                            className="text-xs px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold transition-colors flex items-center gap-1"
                          >
                            <ArrowRight size={12} /> Transfer
                          </button>
                        )}
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1 px-2 py-1"
                        >
                          Open <ExternalLink size={11} />
                        </a>
                      </div>
`;
drive = drive.replace(
  `<a\n                        href={file.webViewLink}\n                        target="_blank"\n                        rel="noreferrer"\n                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"\n                      >\n                        Open <ExternalLink size={11} />\n                      </a>`,
  newActions
);
fs.writeFileSync('src/views/DriveView.tsx', drive, 'utf8');

// Now make Reply button prominent in MailView.tsx
let mail = fs.readFileSync('src/views/MailView.tsx', 'utf8');
mail = mail.replace(
  `<button\n                  onClick={() => onReply(activeEmail)}\n                  className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-slate-200 shadow-2xs"\n                  title="Reply"\n                >\n                  <Reply size={15} />\n                </button>`,
  `<button\n                  onClick={() => onReply(activeEmail)}\n                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-blue-200 flex items-center gap-1.5 shadow-2xs"\n                  title="Reply"\n                >\n                  <Reply size={14} /> <span>Reply</span>\n                </button>`
);
fs.writeFileSync('src/views/MailView.tsx', mail, 'utf8');
