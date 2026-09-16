const fs = require('fs');

let adapter = fs.readFileSync('src/services/multiCloudAdapter.ts', 'utf8');

// 1. Update quota logic
adapter = adapter.replace(
  `const limit = parseInt(data.storageQuota?.limit || '16106127360', 10); // fallback 15GB`,
  `const limitRaw = data.storageQuota?.limit;
      const usage = parseInt(data.storageQuota?.usage || '0', 10);
      // If limit is missing (Workspace unlimited), set a massive virtual limit (e.g. 5TB or double usage)
      const limit = limitRaw ? parseInt(limitRaw, 10) : Math.max(usage * 2, 5 * 1024 * 1024 * 1024 * 1024);`
);
adapter = adapter.replace(
  `const usage = parseInt(data.storageQuota?.usage || '0', 10);`,
  ``
);

// 2. Add makeFilePublic helper
const makePublicFunc = `
export const makeGoogleDriveFilePublic = async (fileId: string, accessToken: string) => {
  const res = await fetch(\`https://www.googleapis.com/drive/v3/files/\${fileId}/permissions\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${accessToken}\`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });
  if (!res.ok) {
    console.warn(\`Could not make file \${fileId} public\`, await res.text());
  }
};
`;

adapter += makePublicFunc;

fs.writeFileSync('src/services/multiCloudAdapter.ts', adapter, 'utf8');
console.log('Adapter updated');
