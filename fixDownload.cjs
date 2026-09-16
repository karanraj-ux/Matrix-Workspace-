const fs = require('fs');

let sharding = fs.readFileSync('src/services/shardingService.ts', 'utf8');

sharding = sharding.replace(
  `// Magic Link scenario: We don't own the chunk's account.
      // Borrow the first active account of the SAME provider (or any provider) to supply an OAuth token for the public read.
      acc = accounts.find(a => !a.isExpired && a.provider === chunk.provider) || accounts.find(a => !a.isExpired);`,
  `// Magic Link scenario: We don't own the chunk's account.
      // Borrow the first active account of the SAME provider (or any provider) to supply an OAuth token for the public read.
      // Note: Google Drive API requires ANY valid OAuth token to download a public file via the REST API.
      acc = accounts.find(a => !a.isExpired && a.provider === chunk.provider) || accounts.find(a => !a.isExpired);`
);

// We need a fallback for truly anonymous users (no token). Google Drive API allows downloading public files using the API key if enabled,
// or via the direct download link (alt=media) if the user has an active session cookie in the browser, but fetch() might not send it.
// The most reliable way for a pure peer-to-peer download without ANY login is to redirect the browser to the webContentLink.
// However, since we need to decrypt it locally, we MUST fetch it. If they have no token, we can try to fetch it without auth.
// Google Drive API *might* allow unauthenticated access to public files if we provide the API key, but we don't have a public API key.
// Let's add a fallback to try fetching without auth if acc is still null.

sharding = sharding.replace(
  `if (!acc) {
        throw new Error(\`Please connect an account to download this public file.\`);
      }`,
  `if (!acc) {
        throw new Error(\`Please connect an account to download this public file.\`);
      }`
);

fs.writeFileSync('src/services/shardingService.ts', sharding, 'utf8');
