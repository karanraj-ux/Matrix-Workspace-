import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Layers,
  Search,
  HardDrive,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Shield,
  Loader2,
  Menu,
  AlertCircle,
  X,
} from 'lucide-react';
import { logout } from './auth';

import { fetchDriveFiles, syncConfigToShadowDb, fetchConfigFromShadowDb } from './services/googleService';
import { AccountToken, DriveFile } from './types';

import { Sidebar, ViewType } from './components/Sidebar';
import { TransferModal } from './components/TransferModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConnectMultiCloudModal } from './components/ConnectMultiCloudModal';
import { completePkceCallback } from './services/pkceAuthService';

import { DriveView } from './views/DriveView';
import { P2PBeamView } from './views/P2PBeamView';
import { SettingsView } from './views/SettingsView';
import { GlobalSearchView } from './views/GlobalSearchView';

import { useAccountPersistence } from './hooks/useAccountPersistence';
import { decodeCompactOrLegacyManifest } from './services/compactMagicCodec';
import { PublicMagicDownloadModal } from './components/PublicMagicDownloadModal';
import { CommandPalette } from './components/CommandPalette';
import { ShardManifest } from './services/shardingService';
import { quotaRebalancer } from './services/quotaRebalancerDaemon';

export default function App() {
  const {
    isInitializing,
    hydrationError,
    accounts,
    setAccounts,
    activeAccountIds,
    setActiveAccountIds,
    isByokMode,
    setIsByokMode,
    customClientId,
    setCustomClientId,
    clearStorageAndReset,
  } = useAccountPersistence();

  // Navigation State (DriveShield Core Views)
  const [currentView, setCurrentView] = useState<ViewType>('drive');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Magic Link Payload detection
  const [pendingMagicHash, setPendingMagicHash] = useState('');
  const [pendingMagicManifest, setPendingMagicManifest] = useState<ShardManifest | null>(null);
  const [isPublicDownloadModalOpen, setIsPublicDownloadModalOpen] = useState(false);

  // GSI and BYOK auth
  const [isGsiReady, setIsGsiReady] = useState(false);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [authConnectingStage, setAuthConnectingStage] = useState<string>('');
  const preInitializedTokenClientRef = useRef<any>(null);

  // Cross-account Transfer State
  const [transferFile, setTransferFile] = useState<DriveFile | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);

  // Command Palette & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Multi-Cloud PKCE Connect Modal
  const [connectModalProvider, setConnectModalProvider] = useState<'onedrive' | 'dropbox' | null>(null);

  // Static Policy Page Modal
  const [activeStaticPage, setActiveStaticPage] = useState<'privacy' | 'terms' | 'about' | 'security' | null>(null);

  // Streamed Files State
  const [aggregatedFiles, setAggregatedFiles] = useState<DriveFile[]>([]);
  const [isLoadingStreams, setIsLoadingStreams] = useState(false);

  // Helper to pre-initialize GSI Token Client synchronously with Drive-only scopes (No Gmail)
  const setupGsiClient = (clientId: string) => {
    if (!clientId || typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2) {
      return;
    }
    try {
      preInitializedTokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: 'email profile openid https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata',
        prompt: 'consent select_account',
        callback: handleAuthCallback,
      });
    } catch (e) {
      console.warn('GSI pre-initialization notice:', e);
    }
  };

  useEffect(() => {
    let resolvedClientId = customClientId?.trim() || '';

    if (
      typeof window !== 'undefined' &&
      (window.location.hash.includes('magic=') || window.location.hash.includes('m='))
    ) {
      const hash = window.location.hash;
      setPendingMagicHash(hash);

      try {
        const decoded = decodeCompactOrLegacyManifest(hash);
        if (decoded) {
          setPendingMagicManifest(decoded);
          setIsPublicDownloadModalOpen(true);
          if ((decoded as any).magicClientId) {
            resolvedClientId = (decoded as any).magicClientId.trim();
            setCustomClientId(resolvedClientId);
          }
        }
      } catch (e) {
        console.warn('Could not parse magic link manifest synchronously', e);
      }

      if (activeAccountIds.size > 0) {
        setCurrentView('drive');
      }
    }

    const checkAndInitGsi = () => {
      if ((window as any).google?.accounts?.oauth2) {
        setIsGsiReady(true);
        if (resolvedClientId) {
          setupGsiClient(resolvedClientId);
        }
      }
    };

    checkAndInitGsi();

    if (typeof window !== 'undefined' && !(window as any).google?.accounts?.oauth2) {
      const existingScript = document.getElementById('gsi-script');
      if (existingScript) {
        existingScript.addEventListener('load', checkAndInitGsi);
      } else {
        const script = document.createElement('script');
        script.id = 'gsi-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = checkAndInitGsi;
        document.body.appendChild(script);
      }
    }
  }, [activeAccountIds.size, customClientId]);

  // Autonomous Multi-Cloud Quota Rebalancing Daemon
  useEffect(() => {
    quotaRebalancer.startDaemon(() => accounts);
    return () => quotaRebalancer.stopDaemon();
  }, [accounts]);

  // PKCE Multi-Cloud OAuth URL Callback Detector (Popup & Redirect)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (code && state) {
      if (window.opener && window.opener !== window) {
        try {
          window.opener.postMessage(
            { type: 'MATRIX_PKCE_CALLBACK', code, state },
            window.location.origin
          );
          window.close();
          return;
        } catch (e) {
          console.warn('Could not postMessage to opener window', e);
        }
      }

      completePkceCallback(code, state)
        .then((newAccount) => {
          handleAddMultiCloudAccount(newAccount);
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch((err) => {
          console.error('Failed to complete PKCE OAuth callback:', err);
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    }
  }, []);

  const handleTokenExpiry = (accountId: string) => {
    setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, isExpired: true } : a)));
  };

  // Fetch Drive File Streams
  useEffect(() => {
    const fetchStreams = async () => {
      if (activeAccountIds.size === 0) {
        setAggregatedFiles([]);
        setIsLoadingStreams(false);
        return;
      }

      const activeAccounts = accounts.filter((a) => activeAccountIds.has(a.id));
      setIsLoadingStreams(true);

      try {
        const drivePromises = activeAccounts.map(async (acc) => {
          return await fetchDriveFiles(acc, handleTokenExpiry);
        });

        const driveResults = await Promise.all(drivePromises);
        const flatDrive = driveResults.flat().sort((a, b) => b.timestamp - a.timestamp);
        setAggregatedFiles(flatDrive);
      } catch (error) {
        console.error('Error fetching Drive files:', error);
      } finally {
        setIsLoadingStreams(false);
      }
    };

    fetchStreams();
  }, [activeAccountIds, accounts]);

  // Sync to Shadow Database
  useEffect(() => {
    if (accounts.length > 0 && !accounts[0].isExpired && !isInitializing) {
      const masterToken = accounts[0].accessToken;
      const configToSync = {
        accounts: accounts.map((a) => ({
          id: a.id,
          email: a.email,
          name: a.name,
          photoURL: a.photoURL,
          isExpired: true,
        })),
        activeAccountIds: Array.from(activeAccountIds),
        currentView: currentView,
      };

      const timer = setTimeout(() => {
        syncConfigToShadowDb(masterToken, configToSync);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [accounts, activeAccountIds, currentView, isInitializing]);

  const handleAuthCallback = async (tokenResponse: any) => {
    if (tokenResponse.error) {
      console.error('BYOK Login Error:', tokenResponse);
      setIsAddingAccount(false);
      setAuthConnectingStage('');
      return;
    }

    setAuthConnectingStage('Securing access token & profile...');
    const accessToken = tokenResponse.access_token;

    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userInfoRes.ok) {
        const errText = await userInfoRes.text();
        throw new Error(`Google UserInfo API Error (${userInfoRes.status}): ${errText}`);
      }

      const userInfo = await userInfoRes.json();
      if (!userInfo.sub) throw new Error('No user ID found in Google UserInfo');

      const newAccount: AccountToken = {
        id: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        photoURL: userInfo.picture,
        accessToken: accessToken,
      };

      const isFirstAccount = accounts.length === 0;

      setAccounts((prev) => {
        if (prev.find((a) => a.id === newAccount.id)) {
          return prev.map((a) => (a.id === newAccount.id ? newAccount : a));
        }
        return [...prev, newAccount];
      });
      setActiveAccountIds((prev) => new Set(prev).add(newAccount.id));

      if (pendingMagicHash || (typeof window !== 'undefined' && window.location.hash.includes('magic='))) {
        setCurrentView('drive');
      } else if (isFirstAccount) {
        try {
          const shadowConfig = await fetchConfigFromShadowDb(accessToken);
          if (shadowConfig) {
            if (shadowConfig.accounts && Array.isArray(shadowConfig.accounts)) {
              setAccounts((prev) => {
                const existingIds = new Set(prev.map((a) => a.id));
                const missingAccounts = shadowConfig.accounts.filter((a: any) => !existingIds.has(a.id));
                return [...prev, ...missingAccounts];
              });
            }
            if (shadowConfig.activeAccountIds && Array.isArray(shadowConfig.activeAccountIds)) {
              setActiveAccountIds((prev) => new Set([...prev, ...shadowConfig.activeAccountIds]));
            }
            if (shadowConfig.currentView) {
              setCurrentView(shadowConfig.currentView as ViewType);
            }
          }
        } catch (e) {
          console.error('Shadow DB hydration failed', e);
        }
      }
    } catch (e) {
      console.error('Failed to fetch user info for BYOK', e);
      alert('Failed to fetch Google User Info. Check console.');
    } finally {
      setIsAddingAccount(false);
      setAuthConnectingStage('');
    }
  };

  const handleLogin = (forceSelect = false) => {
    try {
      setIsAddingAccount(true);
      setAuthConnectingStage('Waiting for account confirmation...');

      if (preInitializedTokenClientRef.current) {
        preInitializedTokenClientRef.current.requestAccessToken();
        return;
      }

      let effectiveClientId = customClientId?.trim();
      const currentHash = pendingMagicHash || (typeof window !== 'undefined' ? window.location.hash : '');
      if (!effectiveClientId && currentHash.includes('magic=')) {
        try {
          const hashVal = currentHash.split('magic=')[1];
          if (hashVal) {
            const decoded = decodeURIComponent(hashVal);
            const jsonStr = atob(decoded);
            const payload = JSON.parse(jsonStr);
            if (payload.magicClientId) {
              effectiveClientId = payload.magicClientId.trim();
              setCustomClientId(effectiveClientId);
            }
          }
        } catch (e) {
          console.warn('Could not parse magic link client ID inside handleLogin', e);
        }
      }

      if (!effectiveClientId) {
        setCurrentView('settings');
        setIsAddingAccount(false);
        setAuthConnectingStage('');
        return;
      }

      triggerGsiLogin(effectiveClientId);
    } catch (error) {
      console.error(error);
      setIsAddingAccount(false);
      setAuthConnectingStage('');
    }
  };

  const triggerGsiLogin = (clientIdToUse?: string) => {
    try {
      const activeCId = (clientIdToUse || customClientId)?.trim();
      if (!activeCId) {
        setCurrentView('settings');
        setIsAddingAccount(false);
        setAuthConnectingStage('');
        return;
      }

      setAuthConnectingStage('Waiting for account confirmation...');

      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: activeCId,
        scope: 'email profile openid https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata',
        prompt: 'consent select_account',
        callback: handleAuthCallback,
      });
      preInitializedTokenClientRef.current = client;
      client.requestAccessToken();
    } catch (e) {
      console.error('GSI Client initialization failed:', e);
      alert('Failed to initialize Google Auth. Is your Client ID valid?');
      setIsAddingAccount(false);
      setAuthConnectingStage('');
    }
  };

  const toggleAccountActive = (id: string) => {
    setActiveAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLogoutAll = async () => {
    try {
      await logout();
      await clearStorageAndReset();
      setAggregatedFiles([]);
      setCurrentView('drive');
    } catch (e) {
      console.error('Logout failed', e);
    }
  };

  const launchDeepWork = (urlTemplate: string, accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account || !account.email) return;
    const url = urlTemplate.replace('{{email}}', encodeURIComponent(account.email));
    window.open(url, '_blank');
  };

  const executeCrossAccountTransfer = async (targetAccountId: string) => {
    if (!transferFile) return;
    const sourceAccount = accounts.find((a) => a.id === transferFile.accountId);
    const targetAccount = accounts.find((a) => a.id === targetAccountId);
    if (!sourceAccount || !targetAccount) return;

    setIsTransferring(true);
    try {
      const isWorkspaceFile = transferFile.mimeType.startsWith('application/vnd.google-apps.');
      let downloadUrl = `https://www.googleapis.com/drive/v3/files/${transferFile.id}?alt=media`;
      let targetMimeType = transferFile.mimeType;
      let targetName = transferFile.name;

      if (isWorkspaceFile) {
        if (transferFile.mimeType === 'application/vnd.google-apps.document') {
          targetMimeType = 'application/pdf';
          targetName = `${transferFile.name}.pdf`;
        } else if (transferFile.mimeType === 'application/vnd.google-apps.spreadsheet') {
          targetMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          targetName = `${transferFile.name}.xlsx`;
        } else if (transferFile.mimeType === 'application/vnd.google-apps.presentation') {
          targetMimeType = 'application/pdf';
          targetName = `${transferFile.name}.pdf`;
        }
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${transferFile.id}/export?mimeType=${encodeURIComponent(targetMimeType)}`;
      }

      const res = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${sourceAccount.accessToken}` },
      });
      if (!res.ok) throw new Error(`Download failed from source drive (${res.statusText})`);
      const blob = await res.blob();
      const fileToUpload = new File([blob], targetName, { type: targetMimeType });

      const { uploadFileToDriveResumable } = await import('./services/googleService');
      await uploadFileToDriveResumable(targetAccount.accessToken, fileToUpload, () => {});

      setTransferSuccess(true);
      setTimeout(() => {
        setTransferFile(null);
        setTransferSuccess(false);
      }, 1500);
    } catch (e) {
      console.error('Cross-Account Transfer Error:', e);
      alert('Transfer failed. Please check storage quotas.');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleAddMultiCloudAccount = (account: AccountToken) => {
    setAccounts((prev) => {
      if (prev.find((a) => a.id === account.id)) {
        return prev.map((a) => (a.id === account.id ? account : a));
      }
      return [...prev, account];
    });
    setActiveAccountIds((prev) => new Set(prev).add(account.id));
  };

  const handleRemoveAccount = (id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setActiveAccountIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  if (isInitializing) {
    return (
      <div className="h-screen w-screen bg-slate-900 flex items-center justify-center text-white">
        <Loader2 className="animate-spin w-8 h-8 text-slate-400" />
      </div>
    );
  }

  if (hydrationError) {
    return (
      <div className="min-h-screen w-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white font-sans">
        <div className="bg-slate-800 p-8 rounded-2xl max-w-md w-full text-center border border-slate-700 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2">Storage Error</h2>
          <p className="text-sm text-neutral-400 mb-6">{hydrationError}</p>
          <button
            onClick={clearStorageAndReset}
            className="w-full py-3 px-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Clear Data &amp; Re-Authenticate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#F8FAFC] font-sans text-slate-900">
      {/* SIDEBAR */}
      <Sidebar
        currentView={currentView}
        setCurrentView={(view) => {
          setCurrentView(view);
          setIsMobileMenuOpen(false);
        }}
        accounts={accounts}
        activeAccountIds={activeAccountIds}
        toggleAccountActive={toggleAccountActive}
        handleLogin={handleLogin}
        isAddingAccount={isAddingAccount}
        launchDeepWork={launchDeepWork}
        handleLogoutAll={handleLogoutAll}
        isMobileMenuOpen={isMobileMenuOpen}
        closeMobileMenu={() => setIsMobileMenuOpen(false)}
        onNewUpload={() => {
          setCurrentView('drive');
        }}
        onAddMultiCloudAccount={(provider) => setConnectModalProvider(provider || 'onedrive')}
      />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#F8FAFC]">
        {/* Top Header */}
        <div className="h-16 bg-white border-b border-slate-200/80 px-4 md:px-6 flex items-center justify-between gap-3 shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <button
              className="md:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-600"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>

            <div
              onClick={() => setIsCommandPaletteOpen(true)}
              className="flex-1 relative cursor-pointer group"
            >
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
              <input
                type="text"
                readOnly
                placeholder="Search Drive files & security actions... (Press ⌘K)"
                value={searchQuery}
                className="w-full pl-10 pr-12 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200/90 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 transition-all outline-none cursor-pointer"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded">
                  ⌘K
                </kbd>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] font-medium text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Zero-Trust Client Engine</span>
            </div>
          </div>
        </div>

        {/* Clean Connection Strip when 0 accounts linked */}
        {accounts.length === 0 && (
          <div className="bg-indigo-50/80 border-b border-indigo-200/90 px-4 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2 text-indigo-950 font-medium">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
              <span>Connect Google Drive to start Zero-Trust vault encryption and storage optimizer.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleLogin(false)}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
              >
                + Connect Google Drive
              </button>
              <button
                onClick={() => setConnectModalProvider('onedrive')}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg font-medium text-xs shadow-2xs transition-colors cursor-pointer"
              >
                + OneDrive (5 GB)
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Views Area */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative bg-[#F8FAFC]">
          <ErrorBoundary>
            <GlobalSearchView
              query={searchQuery}
              accounts={accounts.filter((a) => activeAccountIds.has(a.id))}
              onClose={() => setSearchQuery('')}
              onClearQuery={() => setSearchQuery('')}
            />

            <AnimatePresence mode="wait">
              <motion.div
                key={currentView}
                initial={{ opacity: 0, y: 10, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.995 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="absolute inset-0 flex flex-col overflow-hidden bg-[#F8FAFC]"
              >
                {/* 1. DRIVE EXPLORER & HUB */}
                {currentView === 'drive' && (
                  <div className="absolute inset-0 bg-[#F8FAFC] flex-col overflow-y-auto flex">
                    <DriveView
                      key="drive-explorer"
                      accounts={accounts}
                      activeAccountIds={activeAccountIds}
                      isLoadingStreams={isLoadingStreams}
                      filteredFiles={aggregatedFiles}
                      setTransferFile={setTransferFile}
                      initialTab="all"
                      initialUploadMode="standard"
                      onOpenDoctor={() => setCurrentView('doctor')}
                      onOpenP2P={() => setCurrentView('p2p')}
                    />
                  </div>
                )}

                {/* 2. ZERO-TRUST VAULT (ML-KEM + RAID-5) */}
                {currentView === 'vault' && (
                  <div className="absolute inset-0 bg-[#F8FAFC] flex-col overflow-y-auto flex">
                    <DriveView
                      key="drive-vault"
                      accounts={accounts}
                      activeAccountIds={activeAccountIds}
                      isLoadingStreams={isLoadingStreams}
                      filteredFiles={aggregatedFiles}
                      setTransferFile={setTransferFile}
                      initialTab="frankenstein"
                      initialUploadMode="vault"
                      onOpenDoctor={() => setCurrentView('doctor')}
                      onOpenP2P={() => setCurrentView('p2p')}
                    />
                  </div>
                )}

                {/* 3. STORAGE & PERMISSION DOCTOR (Redirects into unified DriveView) */}
                {currentView === 'doctor' && (
                  <div className="absolute inset-0 bg-[#F8FAFC] flex-col overflow-y-auto flex">
                    <DriveView
                      key="drive-doctor"
                      accounts={accounts}
                      activeAccountIds={activeAccountIds}
                      isLoadingStreams={isLoadingStreams}
                      filteredFiles={aggregatedFiles}
                      setTransferFile={setTransferFile}
                      initialTab="public"
                      initialUploadMode="standard"
                      onOpenDoctor={() => setCurrentView('drive')}
                      onOpenP2P={() => setCurrentView('p2p')}
                    />
                  </div>
                )}

                {/* 4. DIRECT P2P BEAM */}
                {currentView === 'p2p' && (
                  <div className="absolute inset-0 bg-[#F8FAFC] flex-col overflow-y-auto flex">
                    <P2PBeamView />
                  </div>
                )}

                {/* 5. SECURITY & SETTINGS */}
                {currentView === 'settings' && (
                  <div className="absolute inset-0 bg-[#F8FAFC] flex-col overflow-y-auto flex">
                    <SettingsView
                      isByokMode={isByokMode}
                      setIsByokMode={setIsByokMode}
                      customClientId={customClientId}
                      setCustomClientId={setCustomClientId}
                      handleLogin={handleLogin}
                      accounts={accounts}
                      onAddMultiCloudAccount={handleAddMultiCloudAccount}
                      onRemoveAccount={handleRemoveAccount}
                    />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </div>

        {/* MOBILE BOTTOM NAVIGATION (Streamlined to 3 Essential Tabs) */}
        <div className="md:hidden h-16 bg-white border-t border-slate-200 flex items-center justify-around shrink-0 px-4 pb-safe z-50 shadow-xs">
          <button
            onClick={() => setCurrentView('drive')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${
              currentView === 'drive' || currentView === 'vault' || currentView === 'doctor'
                ? 'text-indigo-600 font-bold'
                : 'text-slate-400 font-medium'
            }`}
          >
            <HardDrive className="w-5 h-5" />
            <span className="text-[11px]">Drive &amp; Vault</span>
          </button>

          <button
            onClick={() => setCurrentView('p2p')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${
              currentView === 'p2p' ? 'text-blue-600 font-bold' : 'text-slate-400 font-medium'
            }`}
          >
            <Radio className="w-5 h-5" />
            <span className="text-[11px]">P2P Beam</span>
          </button>

          <button
            onClick={() => setCurrentView('settings')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${
              currentView === 'settings' ? 'text-slate-900 font-bold' : 'text-slate-400 font-medium'
            }`}
          >
            <Shield className="w-5 h-5" />
            <span className="text-[11px]">Security</span>
          </button>
        </div>

        {/* Cross-Account Transfer Modal */}
        <TransferModal
          transferFile={transferFile}
          setTransferFile={setTransferFile}
          isTransferring={isTransferring}
          transferSuccess={transferSuccess}
          accounts={accounts}
          executeCrossAccountTransfer={executeCrossAccountTransfer}
        />
      </div>

      {/* Zero-Auth Direct P2P Magic Download Modal */}
      <PublicMagicDownloadModal
        isOpen={isPublicDownloadModalOpen}
        onClose={() => setIsPublicDownloadModalOpen(false)}
        manifest={pendingMagicManifest}
        accounts={accounts}
        onConnectAccount={() => handleLogin()}
      />

      {/* Connect Multi-Cloud Provider Modal (PKCE) */}
      {connectModalProvider && (
        <ConnectMultiCloudModal
          isOpen={true}
          initialProvider={connectModalProvider}
          onClose={() => setConnectModalProvider(null)}
          onAccountAdded={(newAcc) => {
            handleAddMultiCloudAccount(newAcc);
            setConnectModalProvider(null);
          }}
        />
      )}

      {/* Static Info Page Modal */}
      {activeStaticPage && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-[#111111] text-white border border-white/10 rounded-2xl max-w-3xl w-full p-6 md:p-8 relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setActiveStaticPage(null)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="prose prose-invert max-w-none font-sans">
              {activeStaticPage === 'privacy' && (
                <>
                  <h1 className="text-2xl md:text-3xl font-black mb-4">Privacy Policy</h1>
                  <p className="text-emerald-400 font-medium text-sm mb-6">
                    100% Zero-Server. Your data and encryption keys never leave your browser.
                  </p>
                  <h3 className="text-lg font-bold mt-6 mb-2">1. Client-Side Cryptography</h3>
                  <p className="text-neutral-400 text-xs leading-relaxed mb-4">
                    DriveShield executes all encryption locally using AES-256-GCM and NIST FIPS 203 ML-KEM-768. We do not operate backend servers that store your files or keys.
                  </p>
                </>
              )}

              {activeStaticPage === 'security' && (
                <>
                  <h1 className="text-2xl md:text-3xl font-black mb-4">Zero-Trust &amp; Sovereign</h1>
                  <p className="text-neutral-400 text-xs leading-relaxed mb-6">
                    Your credentials, encryption keys, and private data never touch any intermediary backend.
                  </p>
                  <div className="space-y-3">
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs">
                      <strong>Client-Side AES-256 + ML-KEM:</strong> Files in your vault are encrypted before upload. Google cannot inspect their contents.
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs">
                      <strong>Permission &amp; Public Link Doctor:</strong> Discover and revoke forgotten public links with one click.
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs">
                      <strong>Direct WebRTC Beam:</strong> Browser-to-browser encrypted transfers without cloud upload.
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        files={aggregatedFiles}
        onNavigate={(view) => setCurrentView(view)}
        onTriggerUpload={() => {
          setCurrentView('drive');
        }}
        onOpenConnect={(provider) => setConnectModalProvider(provider || 'onedrive')}
      />
    </div>
  );
}
