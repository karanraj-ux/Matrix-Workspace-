const fs = require('fs');

let sharding = fs.readFileSync('src/services/shardingService.ts', 'utf8');

sharding = sharding.replace(
  `export const createMagicShareLink = async (
  manifest: ShardManifest
): Promise<string> => {
  const masterKey = manifest.isEncrypted ? await getOrGenerateMasterKey() : '';
  const exportPayload = {
    ...manifest,
    magicKey: masterKey,
  };`,
  `export const createMagicShareLink = async (
  manifest: ShardManifest,
  clientId?: string
): Promise<string> => {
  const masterKey = manifest.isEncrypted ? await getOrGenerateMasterKey() : '';
  const exportPayload: any = {
    ...manifest,
    magicKey: masterKey,
  };
  if (clientId) {
    exportPayload.magicClientId = clientId;
  }`
);
fs.writeFileSync('src/services/shardingService.ts', sharding, 'utf8');

// Also update DriveView.tsx to pass customClientId
let drive = fs.readFileSync('src/views/DriveView.tsx', 'utf8');
drive = drive.replace(
  `interface DriveViewProps {`,
  `interface DriveViewProps {\n  customClientId?: string;`
);

drive = drive.replace(
  `const handleGenerateMagicLink = async (record: StoredManifestRecord) => {`,
  `const handleGenerateMagicLink = async (record: StoredManifestRecord) => {
    // Pass customClientId so peer doesn't need to BYOK
    const cId = (props as any).customClientId || '';`
);
drive = drive.replace(
  `const link = await createMagicShareLink(record.manifest);`,
  `const link = await createMagicShareLink(record.manifest, cId);`
);

// We need to inject `props` or just extract customClientId
drive = drive.replace(
  `export const DriveView: React.FC<DriveViewProps> = ({`,
  `export const DriveView: React.FC<DriveViewProps> = (props) => {\n  const {\n    customClientId,`
);
drive = drive.replace(
  `  isLoadingStreams,
  filteredFiles,
}) => {`,
  `  isLoadingStreams,
  filteredFiles,
  onAttachToEmail,
  setTransferFile
  } = props;`
);
fs.writeFileSync('src/views/DriveView.tsx', drive, 'utf8');

let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace(
  `<DriveView\n`,
  `<DriveView\n                      customClientId={customClientId}\n                      onAttachToEmail={(file) => { setFileToAttach(file); setReplyToEmail(null); setIsComposeOpen(true); }}\n                      setTransferFile={setTransferFile}\n`
);

// Wait, we need to extract magicClientId from pendingMagicHash on boot
const extractMagicClientId = `
      // If we are already logged in, automatically switch to drive view
      if (activeAccountIds.size > 0) {
        setCurrentView('drive');
      } else {
        // Try to extract magicClientId from hash
        try {
           const hashVal = window.location.hash.split('magic=')[1];
           if (hashVal) {
             const decoded = decodeURIComponent(hashVal);
             const jsonStr = atob(decoded);
             const payload = JSON.parse(jsonStr);
             if (payload.magicClientId) {
                setCustomClientId(payload.magicClientId); // Auto-fill Client ID for peer!
             }
           }
        } catch (e) {
           console.warn('Could not parse magic link client ID', e);
        }
      }
`;
app = app.replace(
  `// If we are already logged in, automatically switch to drive view
      if (activeAccountIds.size > 0) {
        setCurrentView('drive');
      }`,
  extractMagicClientId
);
fs.writeFileSync('src/App.tsx', app, 'utf8');
console.log('Fixed magic link BYOK');
