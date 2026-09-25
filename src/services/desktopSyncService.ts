/**
 * Matrix Desktop Folder Mount & Sync Service
 * 
 * Powered by the native File System Access API (showDirectoryPicker):
 * 1. Mounts a local OS directory directly in the browser.
 * 2. Scans local files and compares them with the Matrix Virtual Drive.
 * 3. Bidirectional Sync:
 *    - Ingests local files -> shards & encrypts across multi-cloud RAID-5 pool.
 *    - Reassembles & writes decrypted cloud files directly into the local folder.
 */

export interface MountedFolderState {
  isSupported: boolean;
  isMounted: boolean;
  folderName: string;
  files: {
    name: string;
    size: number;
    lastModified: number;
  }[];
}

class DesktopSyncService {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private folderName: string = '';

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  /**
   * Prompts the user to pick a local OS folder to mount
   */
  public async mountFolder(): Promise<{
    success: boolean;
    folderName: string;
    files: { name: string; size: number; lastModified: number }[];
    error?: string;
  }> {
    if (!this.isSupported()) {
      return {
        success: false,
        folderName: '',
        files: [],
        error: 'File System Access API is not supported in this browser.',
      };
    }

    try {
      this.dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });
      this.folderName = this.dirHandle?.name || 'Local Folder';
      const files = await this.listMountedFiles();

      return {
        success: true,
        folderName: this.folderName,
        files,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, folderName: '', files: [], error: 'User cancelled folder selection.' };
      }
      return { success: false, folderName: '', files: [], error: err.message };
    }
  }

  /**
   * Lists files currently inside the mounted local folder
   */
  public async listMountedFiles(): Promise<{ name: string; size: number; lastModified: number }[]> {
    if (!this.dirHandle) return [];
    const files: { name: string; size: number; lastModified: number }[] = [];

    try {
      for await (const entry of (this.dirHandle as any).values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          files.push({
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
          });
        }
      }
    } catch (e) {
      console.warn('Could not scan mounted directory', e);
    }

    return files;
  }

  /**
   * Reads a specific file from the mounted local directory as a standard File object
   */
  public async readLocalFile(filename: string): Promise<File | null> {
    if (!this.dirHandle) return null;
    try {
      const fileHandle = await this.dirHandle.getFileHandle(filename);
      return await fileHandle.getFile();
    } catch (e) {
      console.warn(`Could not read local file ${filename}:`, e);
      return null;
    }
  }

  /**
   * Writes a decrypted File or Blob directly to the mounted local folder on disk
   */
  public async writeLocalFile(filename: string, content: Blob | ArrayBuffer): Promise<boolean> {
    if (!this.dirHandle) return false;
    try {
      const fileHandle = await this.dirHandle.getFileHandle(filename, { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (e) {
      console.error(`Failed to write file ${filename} to local directory:`, e);
      return false;
    }
  }

  public getFolderName(): string {
    return this.folderName;
  }

  public isMounted(): boolean {
    return this.dirHandle !== null;
  }

  public unmount(): void {
    this.dirHandle = null;
    this.folderName = '';
  }
}

export const desktopSync = new DesktopSyncService();
