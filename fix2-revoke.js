const fs = require('fs');

let adapter = fs.readFileSync('src/services/multiCloudAdapter.ts', 'utf8');

const revokeFunc = `
export const revokeGoogleDriveFilePublic = async (fileId: string, accessToken: string) => {
  const res = await fetch(\`https://www.googleapis.com/drive/v3/files/\${fileId}/permissions\`, {
    headers: { Authorization: \`Bearer \${accessToken}\` }
  });
  if (res.ok) {
    const data = await res.json();
    const publicPerm = data.permissions?.find((p: any) => p.type === 'anyone');
    if (publicPerm) {
      await fetch(\`https://www.googleapis.com/drive/v3/files/\${fileId}/permissions/\${publicPerm.id}\`, {
        method: 'DELETE',
        headers: { Authorization: \`Bearer \${accessToken}\` }
      });
    }
  }
};
`;

adapter += revokeFunc;
fs.writeFileSync('src/services/multiCloudAdapter.ts', adapter, 'utf8');

let sharding = fs.readFileSync('src/services/shardingService.ts', 'utf8');
sharding = sharding.replace(
  `makeGoogleDriveFilePublic,`,
  `makeGoogleDriveFilePublic,\n  revokeGoogleDriveFilePublic,`
);

const revokeHelper = `
export const revokeManifestChunksPublic = async (manifest: ShardManifest, accounts: AccountToken[]) => {
  const allChunks = [...manifest.dataChunks, ...(manifest.parityChunk ? [manifest.parityChunk] : [])];
  
  const revokePromises = allChunks.map(async (chunk) => {
    if (chunk.provider === 'google') {
      const account = accounts.find((a) => a.id === chunk.accountId);
      if (account) {
        await revokeGoogleDriveFilePublic(chunk.driveFileId, account.accessToken);
      }
    }
  });

  await Promise.all(revokePromises);
};
`;
sharding += revokeHelper;
fs.writeFileSync('src/services/shardingService.ts', sharding, 'utf8');

