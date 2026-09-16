/**
 * Multi-Cloud Provider Adapter
 * Handles chunk upload, download, deletion, and quota checks for:
 * 1. Google Drive (REST v3)
 * 2. Microsoft OneDrive (Microsoft Graph v1.0)
 * 3. Dropbox (Dropbox API v2 Content Endpoints)
 */

import { AccountToken, StorageQuotaInfo } from '../types';

/**
 * Fetch storage quota for an account across Google, OneDrive, or Dropbox.
 */
export const fetchAccountQuota = async (account: AccountToken): Promise<StorageQuotaInfo> => {
  const provider = account.provider || 'google';

  try {
    if (provider === 'google') {
      const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      });
      if (!res.ok) throw new Error(`Google quota fetch failed: ${res.statusText}`);
      const data = await res.json();
      const limitRaw = data.storageQuota?.limit;
      
      // If limit is missing (Workspace unlimited), set a massive virtual limit (e.g. 5TB or double usage)
      const limit = limitRaw ? parseInt(limitRaw, 10) : Math.max(usage * 2, 5 * 1024 * 1024 * 1024 * 1024);
      const usage = parseInt(data.storageQuota?.usage || '0', 10);
      return {
        totalBytes: limit,
        usedBytes: usage,
        freeBytes: Math.max(0, limit - usage),
        provider: 'google',
      };
    } else if (provider === 'onedrive') {
      const res = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      });
      if (!res.ok) throw new Error(`OneDrive quota fetch failed: ${res.statusText}`);
      const data = await res.json();
      const quota = data.quota || {};
      const total = quota.total || 5368709120; // fallback 5GB
      const used = quota.used || 0;
      return {
        totalBytes: total,
        usedBytes: used,
        freeBytes: quota.remaining || Math.max(0, total - used),
        provider: 'onedrive',
      };
    } else if (provider === 'dropbox') {
      const res = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`Dropbox quota fetch failed: ${res.statusText}`);
      const data = await res.json();
      const used = data.used || 0;
      const total = data.allocation?.allocated || 2147483648; // fallback 2GB
      return {
        totalBytes: total,
        usedBytes: used,
        freeBytes: Math.max(0, total - used),
        provider: 'dropbox',
      };
    }
  } catch (err) {
    console.warn(`Could not retrieve quota for ${account.email} (${provider}):`, err);
  }

  // Fallback defaults if offline or restricted scope
  return {
    totalBytes: provider === 'dropbox' ? 2147483648 : provider === 'onedrive' ? 5368709120 : 16106127360,
    usedBytes: 0,
    freeBytes: provider === 'dropbox' ? 2147483648 : provider === 'onedrive' ? 5368709120 : 16106127360,
    provider,
  };
};

/**
 * Upload a binary chunk to the target provider.
 */
export const uploadChunkToProvider = async (
  account: AccountToken,
  chunkBlob: Blob,
  chunkName: string
): Promise<{ fileId: string; downloadPath?: string }> => {
  const provider = account.provider || 'google';

  if (provider === 'google') {
    // Google Drive direct resumable / media stream
    const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'application/octet-stream',
        'X-Upload-Content-Length': `${chunkBlob.size}`,
      },
      body: JSON.stringify({
        name: chunkName,
        properties: { isFrankensteinShard: 'true' },
      }),
    });

    const uploadLocation = initRes.headers.get('Location');
    if (initRes.ok && uploadLocation) {
      const uploadRes = await fetch(uploadLocation, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: chunkBlob,
      });
      if (!uploadRes.ok) throw new Error(`Google chunk upload failed: ${uploadRes.statusText}`);
      const data = await uploadRes.json();
      return { fileId: data.id };
    }

    // Direct fallback
    const directRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=media', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: chunkBlob,
    });
    if (!directRes.ok) throw new Error(`Google direct chunk upload failed: ${directRes.statusText}`);
    const directData = await directRes.json();
    await fetch(`https://www.googleapis.com/drive/v3/files/${directData.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: chunkName }),
    });
    return { fileId: directData.id };
  } else if (provider === 'onedrive') {
    // Microsoft Graph upload
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/Frankenstein/${encodeURIComponent(
      chunkName
    )}:/content`;
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: chunkBlob,
    });
    if (!res.ok) throw new Error(`OneDrive upload failed: ${res.statusText}`);
    const data = await res.json();
    return { fileId: data.id, downloadPath: data['@microsoft.graph.downloadUrl'] };
  } else if (provider === 'dropbox') {
    // Dropbox upload
    const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: `/Frankenstein/${chunkName}`,
          mode: 'overwrite',
          autorename: false,
          mute: true,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: chunkBlob,
    });
    if (!res.ok) throw new Error(`Dropbox upload failed: ${res.statusText}`);
    const data = await res.json();
    return { fileId: data.id, downloadPath: data.path_lower };
  }

  throw new Error(`Unsupported cloud provider: ${provider}`);
};

/**
 * Download a binary chunk from the target provider.
 */
export const downloadChunkFromProvider = async (
  account: AccountToken,
  fileId: string,
  downloadPath?: string
): Promise<ArrayBuffer> => {
  const provider = account.provider || 'google';

  if (provider === 'google') {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    if (!res.ok) throw new Error(`Google chunk download failed: ${res.statusText}`);
    return await res.arrayBuffer();
  } else if (provider === 'onedrive') {
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`;
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    if (!res.ok) throw new Error(`OneDrive chunk download failed: ${res.statusText}`);
    return await res.arrayBuffer();
  } else if (provider === 'dropbox') {
    const res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path: downloadPath || fileId }),
      },
    });
    if (!res.ok) throw new Error(`Dropbox chunk download failed: ${res.statusText}`);
    return await res.arrayBuffer();
  }

  throw new Error(`Unsupported provider: ${provider}`);
};

/**
 * Delete a binary chunk from the provider.
 */
export const deleteChunkFromProvider = async (
  account: AccountToken,
  fileId: string,
  downloadPath?: string
): Promise<void> => {
  const provider = account.provider || 'google';

  if (provider === 'google') {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
  } else if (provider === 'onedrive') {
    await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
  } else if (provider === 'dropbox') {
    await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: downloadPath || fileId }),
    });
  }
};

export const makeGoogleDriveFilePublic = async (fileId: string, accessToken: string) => {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });
  if (!res.ok) {
    console.warn(`Could not make file ${fileId} public`, await res.text());
  }
};

export const revokeGoogleDriveFilePublic = async (fileId: string, accessToken: string) => {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (res.ok) {
    const data = await res.json();
    const publicPerm = data.permissions?.find((p) => p.type === 'anyone');
    if (publicPerm) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${publicPerm.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }
  }
};
