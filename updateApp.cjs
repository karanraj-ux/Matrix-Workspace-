const fs = require('fs');
let appCode = fs.readFileSync('src/App.tsx', 'utf8');

// Add imports
appCode = appCode.replace(
  `import { AccountToken, GmailMessage, DriveFile } from './types';`,
  `import { AccountToken, GmailMessage, DriveFile } from './types';\nimport { AutomationRule } from './types/automation';\nimport { get, set } from 'idb-keyval';`
);

// Add states
const statesToAdd = `
  // Automation Modal State
  const [automateEmail, setAutomateEmail] = useState<GmailMessage | null>(null);
  const [automateTarget, setAutomateTarget] = useState('');
  const [automateFeedback, setAutomateFeedback] = useState('');
`;

appCode = appCode.replace(
  `const [replyToEmail, setReplyToEmail] = useState<GmailMessage | null>(null);`,
  `const [replyToEmail, setReplyToEmail] = useState<GmailMessage | null>(null);\n${statesToAdd}`
);

// Add handler
const handlerToAdd = `
  const handleSaveAutomation = async () => {
    if (!automateEmail || !automateTarget.trim()) return;
    
    // Parse sender cleanly (e.g. "Name <email@domain.com>" -> "email@domain.com")
    let rawFrom = automateEmail.from || '';
    let cleanEmail = rawFrom;
    if (rawFrom.includes('<') && rawFrom.includes('>')) {
      cleanEmail = rawFrom.split('<')[1].split('>')[0];
    }
    cleanEmail = cleanEmail.trim();

    const newRule: AutomationRule = {
      id: Math.random().toString(36).substring(2, 9),
      name: \`Auto-Forward: \${cleanEmail}\`,
      sourceAccountId: automateEmail.accountId,
      trigger: 'ON_NEW_EMAIL',
      conditions: [{
        id: 'c1',
        field: 'from',
        operator: 'contains',
        value: cleanEmail
      }],
      actions: [
        { id: 'a1', type: 'FORWARD_EMAIL', targetEmail: automateTarget.trim() },
        { id: 'a2', type: 'MARK_AS_READ' }
      ],
      isActive: true,
      createdAt: Date.now()
    };

    const existingRules = (await get<AutomationRule[]>('matrix_automation_rules')) || [];
    await set('matrix_automation_rules', [newRule, ...existingRules]);
    
    setAutomateFeedback('Automation created! Future emails will forward instantly.');
    setTimeout(() => {
      setAutomateFeedback('');
      setAutomateEmail(null);
      setAutomateTarget('');
    }, 2500);
  };
`;

appCode = appCode.replace(
  `  const [magicTransferAccount, setMagicTransferAccount] = useState<string>('');`,
  `  const [magicTransferAccount, setMagicTransferAccount] = useState<string>('');\n${handlerToAdd}`
);

// Add to MailView props
appCode = appCode.replace(
  `onReply={(email) => {`,
  `onAutomateSender={(email) => setAutomateEmail(email)}\n                      onReply={(email) => {`
);

// Add the modal JSX near the bottom
const modalJsx = `
        {/* AUTOMATION MODAL */}
        {automateEmail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900">Automate this Sender</h3>
                <button onClick={() => setAutomateEmail(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                  <X size={20} />
                </button>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                <p className="text-sm font-semibold text-slate-700">Forward all future emails from:</p>
                <p className="text-xs text-slate-500 mt-1 truncate">{automateEmail.from}</p>
              </div>

              <div className="mb-6">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Forward Instantly To:</label>
                <input
                  type="email"
                  placeholder="your-main-email@gmail.com"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  value={automateTarget}
                  onChange={(e) => setAutomateTarget(e.target.value)}
                />
              </div>

              {automateFeedback && (
                <div className="mb-4 p-2 text-center text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg">
                  {automateFeedback}
                </div>
              )}

              <button
                onClick={handleSaveAutomation}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-sm transition-colors cursor-pointer"
              >
                Create Automation Rule
              </button>
            </div>
          </div>
        )}
`;

appCode = appCode.replace(
  `{/* COMPOSE MODAL */}`,
  `${modalJsx}\n\n        {/* COMPOSE MODAL */}`
);

fs.writeFileSync('src/App.tsx', appCode, 'utf8');
console.log('App updated');
