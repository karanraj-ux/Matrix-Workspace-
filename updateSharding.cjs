const fs = require('fs');

let service = fs.readFileSync('src/services/shardingService.ts', 'utf8');

service = service.replace(
  `import {\n  uploadChunkToProvider,`,
  `import {\n  uploadChunkToProvider,\n  makeGoogleDriveFilePublic,`
);

const makePublicHelper = `
/**
 * Grants public read access to all chunks in a manifest (Google Drive only for now).
 * This makes peer-to-peer Magic Links completely decoupled from the sender's OAuth session.
 */
export const makeManifestChunksPublic = async (manifest: ShardManifest, accounts: AccountToken[]) => {
  const allChunks = [...manifest.dataChunks, ...(manifest.parityChunk ? [manifest.parityChunk] : [])];
  
  const publicPromises = allChunks.map(async (chunk) => {
    if (chunk.provider === 'google') {
      const account = accounts.find((a) => a.id === chunk.accountId);
      if (account) {
        await makeGoogleDriveFilePublic(chunk.driveFileId, account.accessToken);
      }
    }
  });

  await Promise.all(publicPromises);
};
`;

service += makePublicHelper;

fs.writeFileSync('src/services/shardingService.ts', service, 'utf8');
console.log('Sharding Service updated');
