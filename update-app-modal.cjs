const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');

const modalHtml = `
      {/* Automate Specific Sender Modal */}
      {automateEmail && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                Automate This Sender
              </h3>
              <button onClick={() => setAutomateEmail(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">If I receive an email exactly from:</p>
                <div className="px-3 py-2 bg-slate-50 rounded-lg text-sm font-mono text-slate-700 border border-slate-200">
                  {(() => {
                    const fromHeader = automateEmail.payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value || '';
                    const match = fromHeader.match(/<([^>]+)>/);
                    return match ? match[1] : fromHeader;
                  })()}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Forward to Email:</label>
                <input
                  type="email"
                  value={automateTarget}
                  onChange={e => setAutomateTarget(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                  placeholder="e.g. main.account@gmail.com"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={async () => {
                    const fromHeader = automateEmail.payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value || '';
                    const match = fromHeader.match(/<([^>]+)>/);
                    const exactEmail = match ? match[1] : fromHeader;
                    if (!exactEmail || !automateTarget) return;

                    const newRule = {
                      id: crypto.randomUUID(),
                      name: \`Forward \${exactEmail}\`,
                      sourceAccountId: automateEmail.accountId,
                      trigger: 'ON_NEW_EMAIL',
                      conditions: [
                        { id: crypto.randomUUID(), field: 'from', operator: 'equals', value: exactEmail }
                      ],
                      actions: [
                        { id: crypto.randomUUID(), type: 'FORWARD_EMAIL', targetEmail: automateTarget }
                      ],
                      createdAt: Date.now(),
                      isActive: true
                    };
                    
                    const { get, set } = await import('idb-keyval');
                    const existingRules = (await get('automation_rules')) || [];
                    await set('automation_rules', [...existingRules, newRule]);
                    
                    setAutomateEmail(null);
                    setAutomateTarget('');
                    setCurrentView('automation'); // Take them to view it!
                  }}
                  disabled={!automateTarget}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-sm shadow-sm transition-colors cursor-pointer"
                >
                  Create Rule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
`;

app = app.replace(
  `{/* Compose Email Modal */}`,
  `${modalHtml}\n      {/* Compose Email Modal */}`
);

// We need to import Zap, X in App.tsx if they aren't already. Let's check.
if (!app.includes('Zap')) {
  app = app.replace(`import { FileText, ExternalLink, Mail, FolderOpen, ArrowRight } from 'lucide-react';`, `import { FileText, ExternalLink, Mail, FolderOpen, ArrowRight, Zap, X } from 'lucide-react';`);
}

fs.writeFileSync('src/App.tsx', app, 'utf8');
