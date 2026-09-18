import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, ArrowRight } from 'lucide-react';
import {
  FileText,
  Loader2,
  Download,
  UploadCloud,
  Layers,
  Database,
  CheckCircle2,
  Trash2,
  RefreshCw,
  HardDrive,
  ShieldCheck,
  Zap,
  Info,
  X,
  Lock,
  LifeBuoy,
  KeyRound,
  Share2,
  Copy,
  Check,
  Cloud,
  ArrowDownCircle,
  ExternalLink,
} from 'lucide-react';
import { get, set } from 'idb-keyval';
import { DriveFile, AccountToken, StorageQuotaInfo } from '../types';
import {
  uploadShardedFile,
  saveManifestToDrive,
  downloadShardedFile, downloadShardedFileStream,
  deleteShardedFile,
  verifyShardIntegrity,
  createMagicShareLink,
  decodeMagicShareLink,
  ShardManifest,
} from '../services/shardingService';
import { getOrGenerateMasterKey, MASTER_KEY_STORAGE_ID } from '../services/cryptoWorkerClient';
import { fetchAccountQuota } from '../services/multiCloudAdapter';

interface DriveViewProps {
  customClientId?: string;
  accounts: AccountToken[];
  activeAccountIds: Set<string>;
  isLoadingStreams: boolean;
  filteredFiles: DriveFile[];
  setTransferFile: (file: DriveFile) => void;
  onAttachToEmail: (file: DriveFile) => void;
}

interface StoredManifestRecord {
  id: string;
  manifestFileId?: string;
  manifest: ShardManifest;
  sourceAccountEmail: string;
}

export const DriveView: React.FC<DriveViewProps> = (props) => {
  const {
    customClientId,
  accounts,
  activeAccountIds,
  isLoadingStreams,
  filteredFiles,
  onAttachToEmail,
  setTransferFile
  } = props;
  const [activeTab, setActiveTab] = useState<'frankenstein' | 'all'>('frankenstein');
  const [shardedRecords, setShardedRecords] = useState<StoredManifestRecord[]>([]);

  // Upload States
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMode, setUploadMode] = useState<'vault' | 'standard'>('vault');
  const [uploadStage, setUploadStage] = useState('');
  const [uploadChunkStats, setUploadChunkStats] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  // Settings for Sharding
  const [enableEncryption, setEnableEncryption] = useState(true);
  const [enableParity, setEnableParity] = useState(true);

  // Status & Notifications
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Download & Reassembly States
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStage, setDownloadStage] = useState('');

  // Integrity Checking
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [integrityResults, setIntegrityResults] = useState<{
    [id: string]: { healthy: boolean; canRecover: boolean; missingChunks: number; parityHealthy: boolean };
  }>({});

  // Master Key Inspector Modal
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [currentMasterKey, setCurrentMasterKey] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState(false);

  // Magic Link Modal
  const [magicLinkModal, setMagicLinkModal] = useState<{ isOpen: boolean; url: string; filename: string }>({
    isOpen: false,
    url: '',
    filename: '',
  });
  const [copiedMagicLink, setCopiedMagicLink] = useState(false);

  // Magic Link Receiver / Import
  const [importMagicInput, setImportMagicInput] = useState('');
  const [isImportingMagic, setIsImportingMagic] = useState(false);

  // Live Storage Quotas per Account
  const [accountQuotas, setAccountQuotas] = useState<Record<string, StorageQuotaInfo>>({});
  const [isLoadingQuotas, setIsLoadingQuotas] = useState(false);

  // Drag-and-drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeAccounts = accounts.filter(a => activeAccountIds.has(a.id) && !a.isExpired);

  // Load existing manifests
  useEffect(() => {
    get('matrix_frankenstein_shards').then(val => {
      if (val && Array.isArray(val)) {
        setShardedRecords(val);
      }
    });
  }, []);

  // Fetch live storage quotas
  const refreshStorageQuotas = async () => {
    if (activeAccounts.length === 0) return;
    setIsLoadingQuotas(true);
    try {
      const quotaEntries = await Promise.all(
        activeAccounts.map(async acc => {
          const quota = await fetchAccountQuota(acc);
          return [acc.id, quota] as const;
        })
      );
      setAccountQuotas(Object.fromEntries(quotaEntries));
    } catch (e) {
      console.warn('Failed to load storage quotas', e);
    } finally {
      setIsLoadingQuotas(false);
    }
  };

  useEffect(() => {
    refreshStorageQuotas();
  }, [accounts, activeAccountIds]);

    // Handle URL Hash Magic Link if present on page load
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("magic=")) {
      const decoded = decodeMagicShareLink(window.location.hash);
      if (decoded) {
        // Automatically import it
        setImportMagicInput("");
        const newRecord = {
          id: Math.random().toString(36).substring(2, 9),
          manifest: decoded,
          sourceAccountEmail: "Imported via Magic Link",
        };
        
        // We have to wait for shardedRecords to be loaded, but in useEffect, 
        // using the functional state update is safer:
        setShardedRecords((prev) => {
           const exists = prev.some(r => r.manifest.filename === decoded.filename && r.manifest.totalSize === decoded.totalSize);
           if (exists) return prev; // Avoid duplicates on reload
           const updated = [newRecord, ...prev];
           set("matrix_frankenstein_shards", updated);
           return updated;
        });

        setStatusMessage({
          type: "success",
          text: `Automatically imported Magic Link for "${decoded.filename}". It is now in your Distributed Drive ready for download.`,
        });
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  // Upload Sharded File (Core Flow)
  const handleUploadFile = async (file: File) => {
    if (!file) return;

    if (activeAccounts.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Cannot shard file: No active accounts selected. Enable at least 1 account.',
      });
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setUploadStage('Initializing distributed multi-cloud worker...');
      setStatusMessage(null);

      
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

      const manifest = await uploadShardedFile(file, activeAccounts, {
        enableEncryption,
        enableParity,
        onProgress: (progress, cur, tot, stage) => {
          setUploadProgress(progress);
          setUploadChunkStats({ current: cur, total: tot });
          if (stage) setUploadStage(stage);
        },
      });

      // Save manifest file to primary active Google Drive account if available
      const primaryGoogle = activeAccounts.find(a => a.provider === 'google' || !a.provider) || activeAccounts[0];
      let manifestDriveId: string | undefined = undefined;

      try {
        if (primaryGoogle.provider === 'google' || !primaryGoogle.provider) {
          manifestDriveId = await saveManifestToDrive(manifest, primaryGoogle);
        }
      } catch (manifestErr) {
        console.warn('Could not mirror manifest to Google Drive, saved to local IndexDB only:', manifestErr);
      }

      const newRecord: StoredManifestRecord = {
        id: manifestDriveId || Math.random().toString(36).substring(2, 9),
        manifestFileId: manifestDriveId,
        manifest,
        sourceAccountEmail: primaryGoogle.email || 'Multi-Cloud Array',
      };

      const updated = [newRecord, ...shardedRecords];
      setShardedRecords(updated);
      await set('matrix_frankenstein_shards', updated);

      setStatusMessage({
        type: 'success',
        text: `Successfully sharded "${file.name}" (${(file.size / (1024 * 1024)).toFixed(
          2
        )} MB) across ${activeAccounts.length} multi-cloud drives with dynamic load balancing, ${
          manifest.isEncrypted ? 'AES-256-GCM zero-knowledge encryption' : 'raw chunks'
        } and ${manifest.parityChunk ? 'RAID-5 fault tolerance' : 'no parity'}!`,
      });

      refreshStorageQuotas();
    } catch (err: any) {
      console.error('Sharding failed:', err);
      setStatusMessage({ type: 'error', text: `Upload failed: ${err.message}` });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStage('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Reassemble & Download
  const handleReassembleDownload = async (record: StoredManifestRecord, explicitKey?: string) => {
    try {
      setDownloadingId(record.id);
      setDownloadProgress(0);
      setDownloadStage('Starting parallel multi-cloud retrieval...');
      setStatusMessage(null);


      // Try streaming directly to disk to save RAM
      if ('showSaveFilePicker' in window) {
        const streamed = await downloadShardedFileStream(
          record.manifest,
          accounts,
          (p, cur, tot, stage) => {
            setDownloadProgress(p);
            if (stage) setDownloadStage(stage);
          },
          explicitKey || record.manifest.magicKey
        );
        if (streamed) {
           setDownloadingId(null);
           setStatusMessage({ type: 'success', text: 'File downloaded directly to disk.' });
           return;
        }
      }

      // Fallback for browsers without Stream API
      const blob = await downloadShardedFile(

        record.manifest,
        accounts,
        (p, cur, tot, stage) => {
          setDownloadProgress(p);
          if (stage) setDownloadStage(stage);
        },
        explicitKey || record.manifest.magicKey
      );

      // Trigger browser file download
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = record.manifest.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      setStatusMessage({
        type: 'success',
        text: `Successfully reassembled, decrypted, and downloaded "${record.manifest.filename}".`,
      });
    } catch (e: any) {
      console.error('Download error:', e);
      setStatusMessage({ type: 'error', text: `Download failed: ${e.message}` });
    } finally {
      setDownloadingId(null);
      setDownloadProgress(0);
      setDownloadStage('');
    }
  };

  // Integrity Check
  const handleIntegrityCheck = async (record: StoredManifestRecord) => {
    setVerifyingId(record.id);
    try {
      const res = await verifyShardIntegrity(record.manifest, accounts);
      setIntegrityResults(prev => ({
        ...prev,
        [record.id]: {
          healthy: res.healthy,
          canRecover: res.canRecover,
          missingChunks: res.missingChunks,
          parityHealthy: res.parityHealthy,
        },
      }));
    } catch (err: any) {
      console.error('Integrity verification failed:', err);
    } finally {
      setVerifyingId(null);
    }
  };

  // Delete Sharded File
  const handleDeleteShardedFile = async (record: StoredManifestRecord) => {
    if (
      !window.confirm(
        `Are you sure you want to completely purge "${record.manifest.filename}"? All chunks across all cloud providers will be permanently deleted.`
      )
    ) {
      return;
    }

    try {
      setStatusMessage({ type: 'info', text: `Purging chunks for "${record.manifest.filename}" across all drives...` });
      await deleteShardedFile(record.manifest, record.manifestFileId || '', accounts);

      const updated = shardedRecords.filter(r => r.id !== record.id);
      setShardedRecords(updated);
      await set('matrix_frankenstein_shards', updated);

      setStatusMessage({
        type: 'success',
        text: `File "${record.manifest.filename}" and its multi-cloud shards were permanently deleted.`,
      });
      refreshStorageQuotas();
    } catch (e: any) {
      console.error('Delete error:', e);
      setStatusMessage({ type: 'error', text: `Failed to delete file shards: ${e.message}` });
    }
  };

  // Generate Magic Share Link

  const handleRevokeMagicLink = async (record: StoredManifestRecord) => {
    setStatusMessage({ type: 'info', text: 'Revoking public permissions...' });
    try {
      await revokeManifestChunksPublic(record.manifest, accounts);
      setStatusMessage({ type: 'success', text: 'Magic Link revoked successfully.' });
    } catch (e) {
      console.warn('Could not revoke all chunks', e);
      setStatusMessage({ type: 'error', text: 'Failed to revoke permissions.' });
    }
  };


  const handleGenerateMagicLink = async (record: StoredManifestRecord) => {
    // Pass customClientId so peer doesn't need to BYOK
    const cId = (props as any).customClientId || '';
    setStatusMessage({ type: 'info', text: 'Updating chunk permissions for public zero-auth access...' });
    try {
      await makeManifestChunksPublic(record.manifest, accounts);
    } catch (e) {
      console.warn('Could not make all chunks public', e);
    }
    try {
      const link = await createMagicShareLink(record.manifest, cId);
      setMagicLinkModal({
        isOpen: true,
        url: link,
        filename: record.manifest.filename,
      });
      setCopiedMagicLink(false);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Could not generate Magic Link: ${err.message}` });
    }
  };

  // Handle Manual Magic Link Import
  const handleImportMagicLink = () => {
    const trimmed = importMagicInput.trim();
    if (!trimmed) return;
    const decoded = decodeMagicShareLink(trimmed);
    if (!decoded) {
      setStatusMessage({ type: 'error', text: 'Invalid Magic Link. Please verify the URL hash format.' });
      return;
    }

    const newRecord: StoredManifestRecord = {
      id: Math.random().toString(36).substring(2, 9),
      manifest: decoded,
      sourceAccountEmail: 'Imported via Magic Link',
    };

    const updated = [newRecord, ...shardedRecords];
    setShardedRecords(updated);
    set('matrix_frankenstein_shards', updated);
    setImportMagicInput('');
    setStatusMessage({
      type: 'success',
      text: `Successfully imported "${decoded.filename}". You can now Reassemble & Download it!`,
    });
  };

  // Total Quota Computations
  const quotaList = Object.values(accountQuotas) as StorageQuotaInfo[];
  const totalPooledCapacity: number = quotaList.reduce((acc: number, q: StorageQuotaInfo) => acc + (q.totalBytes || 0), 0);
  const totalUsedCapacity: number = quotaList.reduce((acc: number, q: StorageQuotaInfo) => acc + (q.usedBytes || 0), 0);
  const totalFreeCapacity: number = Math.max(0, totalPooledCapacity - totalUsedCapacity);
  const usedPercentage: number =
    totalPooledCapacity > 0 ? Math.min(100, Math.round((totalUsedCapacity / totalPooledCapacity) * 100)) : 0;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div
      className="h-full flex flex-col bg-[#F8FAFC] overflow-y-auto"
      onDragOver={e => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={e => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleUploadFile(e.dataTransfer.files[0]);
        }
      }}
    >
      {/* DRAG-AND-DROP OVERLAY */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-blue-900/60 backdrop-blur-xs flex items-center justify-center pointer-events-none p-6">
          <div className="bg-white rounded-3xl p-10 max-w-md w-full text-center shadow-2xl border-4 border-dashed border-blue-500 animate-pulse">
            <UploadCloud className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h3 className="text-xl font-black text-slate-900">Drop Any File to Shard</h3>
            <p className="text-xs text-slate-500 mt-2">
              The engine will automatically slice, encrypt (AES-256-GCM), compute RAID-5 parity, and stripe across your
              connected Google Drive, OneDrive, and Dropbox accounts!
            </p>
          </div>
        </div>
      )}

      {/* TOP HEADER */}
      <div className="bg-white border-b border-slate-200/90 px-6 py-5 shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 tracking-tight">
                  Unified Multi-Cloud Virtual Drive
                </h1>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  RAID-5 Array
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Presents multiple Google Drive, OneDrive, and Dropbox accounts as a single secure virtual hard disk with client-side encryption.
              </p>
            </div>
          </div>

          {/* Quick Action Bar */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableEncryption}
                  onChange={e => setEnableEncryption(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                />
                <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                  <Lock size={12} className="text-emerald-600" /> AES-256
                </span>
              </label>

              <span className="text-slate-300">|</span>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableParity}
                  onChange={e => setEnableParity(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                  <LifeBuoy size={12} className="text-blue-600" /> RAID-5 Parity
                </span>
              </label>

              <button
                onClick={() => {
                  getOrGenerateMasterKey().then(k => setCurrentMasterKey(k));
                  setShowKeyModal(true);
                }}
                title="View Zero-Knowledge Master Key"
                className="text-slate-400 hover:text-slate-800 ml-1 cursor-pointer"
              >
                <KeyRound size={13} />
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  handleUploadFile(e.target.files[0]);
                }
              }}
            />
            
            <div className="flex bg-slate-100 rounded-lg p-1 mr-4">
              <button
                onClick={() => setUploadMode('standard')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${uploadMode === 'standard' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Standard
              </button>
              <button
                onClick={() => setUploadMode('vault')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1 ${uploadMode === 'vault' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Vault (RAID-5)
              </button>
            </div>

            <button
              disabled={isUploading || activeAccounts.length === 0}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UploadCloud className="w-3.5 h-3.5" />
              )}
              {isUploading ? `Sharding... ${uploadProgress}%` : 'Upload Any File (Device)'}
            </button>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="max-w-6xl mx-auto flex items-center justify-between mt-5 border-b border-slate-100 pt-1">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab('frankenstein')}
              className={`pb-2.5 text-xs font-semibold transition-all relative ${
                activeTab === 'frankenstein' ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                Multi-Cloud Virtual Hard Disks ({shardedRecords.length})
              </span>
              {activeTab === 'frankenstein' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('all')}
              className={`pb-2.5 text-xs font-semibold transition-all relative ${
                activeTab === 'all' ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Raw Drive Files ({filteredFiles.length})
              </span>
              {activeTab === 'all' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />
              )}
            </button>
          </div>

          <button
            onClick={refreshStorageQuotas}
            disabled={isLoadingQuotas}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer pb-2"
          >
            <RefreshCw size={12} className={isLoadingQuotas ? 'animate-spin text-emerald-600' : ''} />
            <span>Refresh Quotas</span>
          </button>
        </div>
      </div>

      {/* BODY CONTENT */}
      <div className="p-6 flex-1">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Status Message Banner */}
          {statusMessage && (
            <div
              className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between border ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : statusMessage.type === 'error'
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
              <button
                onClick={() => setStatusMessage(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                  <span>{uploadStage || 'Sharding, Encrypting & Distributing to Cloud Providers...'}</span>
                </div>
                <span className="text-xs font-bold text-emerald-600">{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Download Progress Bar */}
          {downloadingId && (
            <div className="bg-white border border-blue-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  <span>{downloadStage || 'Reassembling & Decrypting Multi-Cloud Shards...'}</span>
                </div>
                <span className="text-xs font-bold text-blue-600">{downloadProgress}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* TAB 1: FRANKENSTEIN MULTI-CLOUD HARD DISKS */}
          {activeTab === 'frankenstein' && (
            <div className="space-y-6">
              {/* DYNAMIC QUOTA & CAPACITY OVERVIEW GAUGE */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div className="space-y-1">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-600" />
                      Multi-Cloud Unified Virtual Hard Disk
                    </h2>
                    <p className="text-xs text-slate-500">
                      Aggregated across {activeAccounts.length} Connected Cloud Accounts (Google, OneDrive, Dropbox).
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-slate-400 font-medium">Free Remaining</div>
                      <div className="text-base font-extrabold text-emerald-600">
                        {formatBytes(totalFreeCapacity)}
                      </div>
                    </div>
                    <div className="text-right border-l border-slate-200 pl-6">
                      <div className="text-xs text-slate-400 font-medium">Total Capacity</div>
                      <div className="text-base font-extrabold text-slate-900">
                        {formatBytes(totalPooledCapacity)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Main Storage Progress Bar */}
                <div className="mt-4 space-y-2">
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                      style={{ width: `${usedPercentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>{formatBytes(totalUsedCapacity)} Used ({usedPercentage}%)</span>
                    <span>{formatBytes(totalFreeCapacity)} Available for Sharding</span>
                  </div>
                </div>

                {/* Per-Account Live Quota Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mt-5 pt-5 border-t border-slate-100">
                  {activeAccounts.map(acc => {
                    const q = accountQuotas[acc.id];
                    const provider = acc.provider || 'google';
                    const usedPct = q && q.totalBytes > 0 ? Math.round((q.usedBytes / q.totalBytes) * 100) : 0;

                    return (
                      <div
                        key={acc.id}
                        className="p-3 rounded-xl border border-slate-200/70 bg-slate-50 flex flex-col justify-between gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate font-semibold text-xs text-slate-800 max-w-[150px]">
                            {acc.email}
                          </span>
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                            {provider}
                          </span>
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                            <span>{q ? formatBytes(q.usedBytes) : '...'} used</span>
                            <span>{q ? formatBytes(q.totalBytes) : '15 GB'}</span>
                          </div>
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${usedPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* P2P MAGIC LINK IMPORT BOX */}
              <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                    <Share2 size={14} />
                    <span>Import Shared Magic Link</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Paste a Magic Link from another device or collaborator to instantly reassemble and decrypt.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="https://...#magic=..."
                    value={importMagicInput}
                    onChange={e => setImportMagicInput(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-full sm:w-64"
                  />
                  <button
                    onClick={handleImportMagicLink}
                    className="px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    Import
                  </button>
                </div>
              </div>

              {/* Sharded Files List */}
              {shardedRecords.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                    <Zap className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">No multi-cloud files yet</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Drag and drop any large file here or click the button below to encrypt and stripe across Google
                    Drive, OneDrive, and Dropbox.
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-xs cursor-pointer"
                  >
                    Select Local File to Shard
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {shardedRecords.map(record => {
                    const isDownloadingThis = downloadingId === record.id;
                    const isVerifyingThis = verifyingId === record.id;
                    const integrity = integrityResults[record.id];

                    return (
                      <div
                        key={record.id}
                        className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/70 flex items-center justify-center shrink-0">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                                  {record.manifest.filename}
                                </h3>
                                {record.manifest.isEncrypted && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <Lock size={10} /> AES-256
                                  </span>
                                )}
                                {record.manifest.parityChunk && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                    <LifeBuoy size={10} /> Multi-Cloud RAID-5
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                <span>{(record.manifest.totalSize / (1024 * 1024)).toFixed(2)} MB</span>
                                <span>•</span>
                                <span>
                                  {record.manifest.totalChunks} Chunks (
                                  {record.manifest.dataChunksCount} Data +{' '}
                                  {record.manifest.parityChunksCount || 0} Parity)
                                </span>
                                <span>•</span>
                                <span>
                                  Created {new Date(record.manifest.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <button
                              disabled={isDownloadingThis}
                              onClick={() => handleReassembleDownload(record)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                            >
                              {isDownloadingThis ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                              {isDownloadingThis ? `Reassembling ${downloadProgress}%` : 'Reassemble & Download'}
                            </button>

                            <button
                              onClick={() => handleGenerateMagicLink(record)}
                              title="Generate P2P Magic Link"
                              className="p-1.5 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-indigo-200 transition-colors cursor-pointer"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>

                            <button
                              disabled={isVerifyingThis}
                              onClick={() => handleIntegrityCheck(record)}
                              title="Check chunk integrity and fault tolerance"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                            >
                              {isVerifyingThis ? (
                                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                              ) : (
                                <ShieldCheck className="w-4 h-4" />
                              )}
                            </button>

                            <button
                              onClick={() => handleDeleteShardedFile(record)}
                              title="Purge all shards across all cloud providers"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Integrity Status Callout */}
                        {integrity && (
                          <div
                            className={`p-2.5 rounded-xl text-xs font-medium flex items-center justify-between border ${
                              integrity.healthy
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : integrity.canRecover
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : 'bg-red-50 text-red-800 border-red-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {integrity.healthy ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <LifeBuoy className="w-4 h-4 text-blue-600" />
                              )}
                              <span>
                                {integrity.healthy
                                  ? 'All chunks 100% healthy across cloud providers.'
                                  : integrity.canRecover
                                  ? `1 chunk missing, but file is 100% RECOVERABLE via RAID-5 parity!`
                                  : `${integrity.missingChunks} chunks missing. Reassembly impossible.`}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold uppercase">
                              {integrity.healthy ? 'Optimal' : integrity.canRecover ? 'Degraded/Recoverable' : 'Failed'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ALL RAW DRIVE FILES */}
          {activeTab === 'all' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
              <div className="space-y-3">
                {filteredFiles.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400">No raw drive files found.</div>
                ) : (
                  filteredFiles.map(file => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <div>
                          <div className="text-xs font-semibold text-slate-800">{file.name}</div>
                          <div className="text-[11px] text-slate-400">{file.accountEmail}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {onAttachToEmail && (
                          <button
                            onClick={() => onAttachToEmail(file)}
                            className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition-colors flex items-center gap-1"
                          >
                            <Mail size={12} /> Attach
                          </button>
                        )}
                        <button
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
                          </button>
                        {setTransferFile && (
                          <button
                            onClick={() => setTransferFile(file)}
                            className="text-xs px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold transition-colors flex items-center gap-1"
                          >
                            <ArrowRight size={12} /> Transfer
                          </button>
                        )}
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1 px-2 py-1"
                        >
                          Open <ExternalLink size={11} />
                        </a>
                      </div>

                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* P2P MAGIC LINK MODAL */}
      <AnimatePresence>
        {magicLinkModal.isOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Share2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">P2P Magic Share Link</h3>
                    <p className="text-xs text-slate-400">Decentralized Direct Download</p>
                  </div>
                </div>
                <button
                  onClick={() => setMagicLinkModal({ isOpen: false, url: '', filename: '' })}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                This self-contained Magic Link embeds the chunk blueprints and the local 256-bit decryption key
                in the URL hash. Send this to any browser to reassemble directly from Google Drive / OneDrive / Dropbox
                with zero server proxy!
              </p>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] break-all text-slate-700 max-h-32 overflow-y-auto">
                {magicLinkModal.url}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(magicLinkModal.url);
                    setCopiedMagicLink(true);
                    setTimeout(() => setCopiedMagicLink(false), 2000);
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {copiedMagicLink ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedMagicLink ? 'Copied to Clipboard!' : 'Copy Magic Link'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MASTER KEY MODAL */}
      <AnimatePresence>
        {showKeyModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <KeyRound size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Zero-Knowledge Master Key</h3>
                    <p className="text-xs text-slate-400">Device Hardware Key</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowKeyModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs break-all text-slate-800 select-all">
                {currentMasterKey}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(currentMasterKey);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedKey ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
