const fs = require('fs');
let content = fs.readFileSync('src/views/DriveView.tsx', 'utf8');

// 1. Add uploadMode state
content = content.replace(
  `  const [uploadProgress, setUploadProgress] = useState(0);`,
  `  const [uploadProgress, setUploadProgress] = useState(0);\n  const [uploadMode, setUploadMode] = useState<'vault' | 'standard'>('vault');`
);

// 2. Add Standard Upload Logic in handleUploadFile
const standardLogic = `
    if (uploadMode === 'standard') {
      try {
        setIsUploading(true);
        setUploadProgress(0);
        setUploadStage('Directing standard upload to connected cloud...');
        setStatusMessage(null);
        
        // Use first active account
        const account = accounts.find(a => a.id === activeAccounts[0].id);
        if (!account) throw new Error('Account not found');
        
        const { uploadFileToDriveResumable } = await import('../services/googleService');
        await uploadFileToDriveResumable(account.accessToken, file, (prog) => {
          setUploadProgress(prog);
        });
        
        setUploadStage('Complete!');
        setUploadProgress(100);
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
        }, 1500);
      } catch (e: any) {
         setStatusMessage({ type: 'error', text: e.message });
         setIsUploading(false);
      }
      return;
    }
`;

content = content.replace(
  `const manifest = await uploadShardedFile(file, activeAccounts, {`,
  `${standardLogic}\n      const manifest = await uploadShardedFile(file, activeAccounts, {`
);

// 3. Add UI Toggle
const uiToggle = `
            <div className="flex bg-slate-100 rounded-lg p-1 mr-4">
              <button
                onClick={() => setUploadMode('standard')}
                className={\`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer \${uploadMode === 'standard' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}\`}
              >
                Standard
              </button>
              <button
                onClick={() => setUploadMode('vault')}
                className={\`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1 \${uploadMode === 'vault' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}\`}
              >
                Vault (RAID-5)
              </button>
            </div>
`;
content = content.replace(
  `<button\n              disabled={isUploading || activeAccounts.length === 0}\n              onClick={() => fileInputRef.current?.click()}`,
  `${uiToggle}\n            <button\n              disabled={isUploading || activeAccounts.length === 0}\n              onClick={() => fileInputRef.current?.click()}`
);

// 4. Update the Standard link share! (Drive Standard files need "Generate Link")
content = content.replace(
  `{setTransferFile && (\n                          <button`,
  `<button
                            onClick={async () => {
                              try {
                                const acc = accounts.find(a => a.email === file.accountEmail);
                                if (!acc) return;
                                const { makeFilePublic } = await import('../services/googleService');
                                await makeFilePublic(file.id, acc.accessToken);
                                setMagicLinkModal({
                                  isOpen: true,
                                  url: file.webViewLink,
                                  filename: file.name
                                });
                              } catch(e) {
                                alert("Failed to generate link");
                              }
                            }}
                            className="text-xs px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <ExternalLink size={12} /> Share
                          </button>\n                        {setTransferFile && (\n                          <button`
);

fs.writeFileSync('src/views/DriveView.tsx', content, 'utf8');
