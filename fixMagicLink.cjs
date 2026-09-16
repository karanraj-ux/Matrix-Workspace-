const fs = require('fs');

// 1. Fix the Sharding Service to use ANY active account if the original account is missing (Peer-to-Peer download)
let sharding = fs.readFileSync('src/services/shardingService.ts', 'utf8');

sharding = sharding.replace(
  `const acc = accounts.find(a => a.id === chunk.accountId);
    if (!acc || acc.isExpired) {
      throw new Error(\`Account \${chunk.accountEmail} (\${chunk.provider}) is unavailable.\`);
    }`,
  `let acc = accounts.find(a => a.id === chunk.accountId);
    if (!acc || acc.isExpired) {
      // Magic Link scenario: We don't own the chunk's account.
      // Borrow the first active account of the SAME provider (or any provider) to supply an OAuth token for the public read.
      acc = accounts.find(a => !a.isExpired && a.provider === chunk.provider) || accounts.find(a => !a.isExpired);
      if (!acc) {
        throw new Error(\`Please connect an account to download this public file.\`);
      }
    }`
);

fs.writeFileSync('src/services/shardingService.ts', sharding, 'utf8');

// 2. Fix App.tsx to detect magic link on the login screen and show a banner
let app = fs.readFileSync('src/App.tsx', 'utf8');

const magicState = `
  const [pendingMagicHash, setPendingMagicHash] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('magic=')) {
      setPendingMagicHash(window.location.hash);
      // If we are already logged in, automatically switch to drive view
      if (activeAccountIds.size > 0) {
        setCurrentView('drive');
      }
    }
  }, [activeAccountIds.size]);
`;

app = app.replace(
  `const [automateTarget, setAutomateTarget] = useState('');`,
  `const [automateTarget, setAutomateTarget] = useState('');\n${magicState}`
);

// Redirect to drive if magic hash is present after login
app = app.replace(
  `setCurrentView('mail');`,
  `setCurrentView(pendingMagicHash ? 'drive' : 'mail');`
);

// Add banner to the login screen
const loginBanner = `
        <div className="bg-white/80 backdrop-blur-xl border border-white/20 p-8 sm:p-12 rounded-[2rem] shadow-2xl max-w-lg w-full relative overflow-hidden">
          {pendingMagicHash && (
            <div className="mb-8 p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-center shadow-sm">
              <h3 className="text-indigo-800 font-bold mb-1 text-sm flex items-center justify-center gap-2">
                <Zap size={16} /> ✨ Magic Link Detected!
              </h3>
              <p className="text-xs text-indigo-600 font-medium">Connect any Google account below to authenticate and download your decentralized file.</p>
            </div>
          )}
`;

app = app.replace(
  `<div className="bg-white/80 backdrop-blur-xl border border-white/20 p-8 sm:p-12 rounded-[2rem] shadow-2xl max-w-lg w-full relative overflow-hidden">`,
  loginBanner
);

fs.writeFileSync('src/App.tsx', app, 'utf8');

console.log('Fixed Magic Link routing and auth borrowing');
