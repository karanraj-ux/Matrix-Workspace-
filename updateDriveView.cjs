const fs = require('fs');
let view = fs.readFileSync('src/views/DriveView.tsx', 'utf8');

view = view.replace(
  `import {`,
  `import { makeManifestChunksPublic,`
);

view = view.replace(
  `const handleGenerateMagicLink = async (record: StoredManifestRecord) => {`,
  `const handleGenerateMagicLink = async (record: StoredManifestRecord) => {
    setStatusMessage({ type: 'info', text: 'Updating chunk permissions for public zero-auth access...' });
    try {
      await makeManifestChunksPublic(record.manifest, accounts);
    } catch (e) {
      console.warn('Could not make all chunks public', e);
    }`
);

fs.writeFileSync('src/views/DriveView.tsx', view, 'utf8');
console.log('DriveView updated');
