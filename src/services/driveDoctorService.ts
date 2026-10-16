import { AccountToken, DriveFile } from '../types';

export interface PublicPermissionInfo {
  permissionId: string;
  type: string;
  role: string;
}

export interface AuditedFile {
  id: string;
  name: string;
  size?: number;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  accountId: string;
  accountEmail: string;
  isPublic: boolean;
  publicPermissions: PublicPermissionInfo[];
}

export interface DriveDuplicateGroup {
  name: string;
  size: number;
  files: AuditedFile[];
}

export interface DriveDoctorScanResult {
  totalFilesScanned: number;
  publicFiles: AuditedFile[];
  giantFiles: AuditedFile[]; // > 50 MB
  duplicates: DriveDuplicateGroup[];
  scannedAt: number;
}

/**
 * Audit Google Drive files for public sharing permissions, large files, and duplicates.
 */
export async function runDriveDoctorScan(
  accounts: AccountToken[]
): Promise<DriveDoctorScanResult> {
  const activeGoogleAccounts = accounts.filter(
    (a) => !a.isExpired && (!a.provider || a.provider === 'google')
  );

  const allAuditedFiles: AuditedFile[] = [];

  for (const acc of activeGoogleAccounts) {
    try {
      const res = await fetch(
        'https://www.googleapis.com/drive/v3/files?pageSize=150&fields=files(id,name,size,mimeType,shared,permissions,webViewLink,modifiedTime,trashed)&q=trashed=false',
        {
          headers: {
            Authorization: `Bearer ${acc.accessToken}`,
          },
        }
      );

      if (!res.ok) {
        console.warn(`Drive audit scan failed for ${acc.email}: ${res.statusText}`);
        continue;
      }

      const data = await res.json();
      const files = data.files || [];

      for (const f of files) {
        const publicPerms: PublicPermissionInfo[] = [];
        if (Array.isArray(f.permissions)) {
          for (const p of f.permissions) {
            if (p.type === 'anyone') {
              publicPerms.push({
                permissionId: p.id,
                type: p.type,
                role: p.role,
              });
            }
          }
        }

        const size = f.size ? parseInt(f.size, 10) : 0;
        allAuditedFiles.push({
          id: f.id,
          name: f.name || 'Untitled File',
          size,
          mimeType: f.mimeType || 'application/octet-stream',
          webViewLink: f.webViewLink,
          modifiedTime: f.modifiedTime,
          accountId: acc.id,
          accountEmail: acc.email || '',
          isPublic: publicPerms.length > 0 || (f.shared && publicPerms.length > 0),
          publicPermissions: publicPerms,
        });
      }
    } catch (err) {
      console.error(`Error auditing account ${acc.email}:`, err);
    }
  }

  // 1. Identify Public Files
  const publicFiles = allAuditedFiles.filter((f) => f.isPublic);

  // 2. Identify Giant Files (> 50 MB)
  const giantFiles = allAuditedFiles
    .filter((f) => (f.size || 0) >= 50 * 1024 * 1024)
    .sort((a, b) => (b.size || 0) - (a.size || 0));

  // 3. Identify Duplicate Files (same name and size > 1MB)
  const fileMap = new Map<string, AuditedFile[]>();
  for (const f of allAuditedFiles) {
    if (!f.size || f.size < 1024 * 1024) continue; // Skip sub-1MB files
    const key = `${f.name.toLowerCase()}_${f.size}`;
    if (!fileMap.has(key)) {
      fileMap.set(key, []);
    }
    fileMap.get(key)!.push(f);
  }

  const duplicates: DriveDuplicateGroup[] = [];
  fileMap.forEach((files) => {
    if (files.length > 1) {
      duplicates.push({
        name: files[0].name,
        size: files[0].size || 0,
        files,
      });
    }
  });

  return {
    totalFilesScanned: allAuditedFiles.length,
    publicFiles,
    giantFiles,
    duplicates,
    scannedAt: Date.now(),
  };
}

/**
 * Revoke public sharing permissions from a specific file.
 */
export async function revokePublicFilePermission(
  accessToken: string,
  fileId: string,
  permissionId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return res.ok || res.status === 204;
  } catch (err) {
    console.error(`Failed to revoke permission ${permissionId} on file ${fileId}:`, err);
    return false;
  }
}

/**
 * Move a file to Google Drive trash.
 */
export async function moveFileToDriveTrash(
  accessToken: string,
  fileId: string
): Promise<boolean> {
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    });
    return res.ok;
  } catch (err) {
    console.error(`Failed to move file ${fileId} to trash:`, err);
    return false;
  }
}

/**
 * Empty Google Drive trash permanently.
 */
export async function emptyGoogleDriveTrash(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/files/trash', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return res.ok || res.status === 204;
  } catch (err) {
    console.error('Failed to empty Drive trash:', err);
    return false;
  }
}
