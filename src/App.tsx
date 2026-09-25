import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Layers, Search, Plus, CheckSquare, Square, Mail, FileText, ExternalLink, LogOut, Loader2, Play, Download, SortDesc, SortAsc, X, Archive, MailOpen, Reply, ArrowRightLeft, CheckCircle2, AlertCircle, LayoutDashboard, Menu, Sparkles, Cloud } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { logout } from './auth';

import { fetchDriveFiles, syncConfigToShadowDb, fetchConfigFromShadowDb } from './services/googleService';
import { fetchUnifiedEmails, fetchUnifiedEmailContent, executeUnifiedEmailAction } from './services/emailService';
import { AccountToken, GmailMessage, DriveFile } from './types';
import { AutomationRule } from './types/automation';

import { Sidebar } from './components/Sidebar';
import { TransferModal } from './components/TransferModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConnectMultiCloudModal } from './components/ConnectMultiCloudModal';
import { completePkceCallback } from './services/pkceAuthService';

import { MailView } from './views/MailView';
import { DriveView } from './views/DriveView';
import { SettingsView } from './views/SettingsView';
import { DashboardView } from './views/DashboardView';
import { useAccountPersistence } from './hooks/useAccountPersistence';
import { ComposeModal } from './components/ComposeModal';
import { SaveAttachmentModal } from './components/SaveAttachmentModal';
import { GlobalSearchView } from './views/GlobalSearchView';
import { AutomationView } from './views/AutomationView';
import { executeAutomations } from './services/automationEngine';

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
    clearStorageAndReset
  } = useAccountPersistence();

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [replyToEmail, setReplyToEmail] = useState<GmailMessage | null>(null);

  // Automation Modal State
  const [automateEmail, setAutomateEmail] = useState<GmailMessage | null>(null);
  const [automateTarget, setAutomateTarget] = useState('');

  const [pendingMagicHash, setPendingMagicHash] = useState('');
  const [magicDetectedFilename, setMagicDetectedFilename] = useState<string>('');
  const [pendingMagicManifest, setPendingMagicManifest] = useState<ShardManifest | null>(null);
  const [isPublicDownloadModalOpen, setIsPublicDownloadModalOpen] = useState(false);
  const [isGsiReady, setIsGsiReady] = useState(false);
  const [authConnectingStage, setAuthConnectingStage] = useState<string>('');
  const preInitializedTokenClientRef = useRef<any>(null);

  // Helper to pre-initialize GSI Token Client synchronously
  const setupGsiClient = (clientId: string) => {
    if (!clientId || typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2) {
      return;
    }
    try {
      preInitializedTokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: 'email profile openid https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
        prompt: 'consent select_account',
        callback: handleAuthCallback,
      });
    } catch (e) {
      console.warn('GSI pre-initialization notice:', e);
    }
  };

  useEffect(() => {
    let resolvedClientId = customClientId?.trim() || '';

    if (typeof window !== 'undefined' && (window.location.hash.includes('magic=') || window.location.hash.includes('m='))) {
      const hash = window.location.hash;
      setPendingMagicHash(hash);
      
      // Parse magic link hash payload (compact #m= or legacy #magic=)
      try {
        const decoded = decodeCompactOrLegacyManifest(hash);
        if (decoded) {
          setPendingMagicManifest(decoded);
          setIsPublicDownloadModalOpen(true);
          if (decoded.filename) {
            setMagicDetectedFilename(decoded.filename);
          }
          if ((decoded as any).magicClientId) {
            resolvedClientId = (decoded as any).magicClientId.trim();
            setCustomClientId(resolvedClientId);
          }
        }
      } catch (e) {
        console.warn('Could not parse magic link manifest synchronously', e);
      }

      // If we are already logged in, automatically switch to drive view
      if (activeAccountIds.size > 0) {
        setCurrentView('drive');
      }
    }

    // Check if GSI is already available or wait for it
    const checkAndInitGsi = () => {
      if ((window as any).google?.accounts?.oauth2) {
        setIsGsiReady(true);
        if (resolvedClientId) {
          setupGsiClient(resolvedClientId);
        }
      }
    };

    checkAndInitGsi();

    if (typeof window !== 'undefined' && !((window as any).google?.accounts?.oauth2)) {
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

  const [automateFeedback, setAutomateFeedback] = useState('');
  const [isAutomating, setIsAutomating] = useState(false);

  const [fileToAttach, setFileToAttach] = useState<DriveFile | null>(null);
  const [attachmentToSave, setAttachmentToSave] = useState<{ email: GmailMessage, attachment: { attachmentId: string; filename: string; mimeType: string; size: number } } | null>(null);

  // App State
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'mail' | 'drive' | 'settings' | 'automation'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  
  // Background Automation Runner
  useEffect(() => {
    const run = async () => {
      if (activeAccountIds.size === 0) return;
      const rules = await get('matrix_automation_rules') || [];
      await executeAutomations(rules, accounts);
    };
    run();
    const interval = setInterval(run, 60000); // Check every 60 seconds
    return () => clearInterval(interval);
  }, [accounts, activeAccountIds]);

  // Autonomous Multi-Cloud Quota Rebalancing Daemon
  useEffect(() => {
    quotaRebalancer.startDaemon(() => accounts);
    return () => quotaRebalancer.stopDaemon();
  }, [accounts]);

  // Settings & Static Pages
  const [activeStaticPage, setActiveStaticPage] = useState<'privacy' | 'terms' | 'about' | 'security' | null>(null);

  // PKCE Multi-Cloud Modal
  const [connectModalProvider, setConnectModalProvider] = useState<'onedrive' | 'dropbox' | null>(null);

  // PKCE OAuth URL Callback Detector (Popup & Redirect)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (code && state) {
      // 1. If this window was opened as a popup by another window
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

      // 2. Otherwise this was a full-page redirect callback
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

  // Email Reader State
  const [activeEmail, setActiveEmail] = useState<any | null>(null);
  const [emailHtml, setEmailHtml] = useState<string>('');
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  // Magic Transfer State
  const [transferFile, setTransferFile] = useState<any | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);

  // Command Palette State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const handleUploadSampleTestAsset = () => {
    const content = `Matrix Workspace RAID-5 Multi-Cloud Shard Test Asset\nTimestamp: ${new Date().toISOString()}\nEncryption: AES-256-GCM\nErasure Coding: XOR Parity\n\nThis test asset verifies bit-exact reconstruction across Google Drive, OneDrive, and Dropbox.`;
    const blob = new Blob([content], { type: 'application/pdf' });
    const testFile = new File([blob], `Matrix_Enterprise_Audit_${Date.now().toString().slice(-4)}.pdf`, {
      type: 'application/pdf',
    });

    setCurrentView('drive');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('MATRIX_START_TEST_UPLOAD', { detail: { file: testFile } }));
    }, 100);
  };

  // Phase 3 Streams
  const [aggregatedEmails, setAggregatedEmails] = useState<any[]>([]);
  const [aggregatedFiles, setAggregatedFiles] = useState<any[]>([]);
  const [isLoadingStreams, setIsLoadingStreams] = useState(false);

  const handleTokenExpiry = (accountId: string) => {
    setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, isExpired: true } : a));
  };

  useEffect(() => {
    const fetchStreams = async () => {
      if (activeAccountIds.size === 0) {
        setAggregatedEmails([]);
        setAggregatedFiles([]);
        return;
      }

      const activeAccounts = accounts.filter(a => activeAccountIds.has(a.id));

      // STEP 1: INSTANT HYDRATION (Local-First Speed)
      // We read from the browser's IndexedDB to instantly paint the UI
      try {
        const cachedEmails = [];
        const cachedFiles = [];
        
        for (const acc of activeAccounts) {
          const e = await get(`matrix_emails_${acc.id}`);
          const f = await get(`matrix_files_${acc.id}`);
          if (e) cachedEmails.push(...e);
          if (f) cachedFiles.push(...f);
        }
        
        if (cachedEmails.length > 0) setAggregatedEmails(cachedEmails.sort((a, b) => b.timestamp - a.timestamp));
        if (cachedFiles.length > 0) setAggregatedFiles(cachedFiles.sort((a, b) => b.timestamp - a.timestamp));
      } catch (e) {
        console.warn("Failed to load from local cache", e);
      }

      // STEP 2: SILENT BACKGROUND SYNC
      // We reach out to Google's servers to fetch the latest changes
      setIsLoadingStreams(true);

      try {
        const drivePromises = activeAccounts.map(async acc => {
          const res = await fetchDriveFiles(acc, handleTokenExpiry);
          await set(`matrix_files_${acc.id}`, res).catch(() => {});
          return res;
        });
        const gmailPromises = activeAccounts.map(async acc => {
          const res = await fetchUnifiedEmails(acc, handleTokenExpiry);
          await set(`matrix_emails_${acc.id}`, res).catch(() => {});
          return res;
        });

        const [driveResults, gmailResults] = await Promise.all([
          Promise.all(drivePromises),
          Promise.all(gmailPromises)
        ]);

        const flatDrive = driveResults.flat().sort((a, b) => b.timestamp - a.timestamp);
        const flatGmail = gmailResults.flat().sort((a, b) => b.timestamp - a.timestamp);

        // STEP 3: SEAMLESS STATE SWAP
        setAggregatedFiles(flatDrive);
        setAggregatedEmails(flatGmail);
      } catch (error) {
        console.error("Error fetching streams:", error);
      } finally {
        setIsLoadingStreams(false);
      }
    };

    fetchStreams();
  }, [activeAccountIds, accounts]);

  // Phase 4: The Shadow Database - Push Sync
  useEffect(() => {
    if (accounts.length > 0 && !accounts[0].isExpired && !isInitializing) {
      const masterToken = accounts[0].accessToken;
      
      const configToSync = {
        accounts: accounts.map(a => ({
           id: a.id,
           email: a.email,
           name: a.name,
           photoURL: a.photoURL,
           isExpired: true // Forces re-auth when downloaded on new device
        })),
        activeAccountIds: Array.from(activeAccountIds),
        currentView: currentView
      };
      
      const timer = setTimeout(() => {
         syncConfigToShadowDb(masterToken, configToSync);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [accounts, activeAccountIds, currentView, isInitializing]);

  const handleAuthCallback = async (tokenResponse: any) => {
    if (tokenResponse.error) {
       console.error("BYOK Login Error:", tokenResponse);
       setIsAddingAccount(false);
       setAuthConnectingStage('');
       return;
    }
    
    setAuthConnectingStage('Securing access token & profile...');
    const accessToken = tokenResponse.access_token;
    
    try {
       const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
         headers: { Authorization: `Bearer ${accessToken}` }
       });
       
       if (!userInfoRes.ok) {
         const errText = await userInfoRes.text();
         throw new Error(`Google UserInfo API Error (${userInfoRes.status}): ${errText}`);
       }
       
       const userInfo = await userInfoRes.json();
       
       if (!userInfo.sub) throw new Error("No user ID found in Google UserInfo");

       const newAccount: AccountToken = {
         id: userInfo.sub,
         email: userInfo.email,
         name: userInfo.name,
         photoURL: userInfo.picture,
         accessToken: accessToken
       };

       const isFirstAccount = accounts.length === 0;

       setAccounts(prev => {
          if (prev.find(a => a.id === newAccount.id)) {
            return prev.map(a => a.id === newAccount.id ? newAccount : a);
          }
          return [...prev, newAccount];
       });
       setActiveAccountIds(prev => new Set(prev).add(newAccount.id));

       if (pendingMagicHash || (typeof window !== 'undefined' && window.location.hash.includes('magic='))) {
          setCurrentView('drive');
       } else if (isFirstAccount) {
          try {
            const shadowConfig = await fetchConfigFromShadowDb(accessToken);
            if (shadowConfig) {
              if (shadowConfig.accounts && Array.isArray(shadowConfig.accounts)) {
                setAccounts(prev => {
                  const existingIds = new Set(prev.map(a => a.id));
                  const missingAccounts = shadowConfig.accounts.filter((a: any) => !existingIds.has(a.id));
                  return [...prev, ...missingAccounts];
                });
              }
              if (shadowConfig.activeAccountIds && Array.isArray(shadowConfig.activeAccountIds)) {
                setActiveAccountIds(prev => new Set([...prev, ...shadowConfig.activeAccountIds]));
              }
              if (shadowConfig.currentView) {
                setCurrentView(shadowConfig.currentView);
              }
            }
          } catch (e) {
            console.error("Shadow DB hydration failed", e);
          }
       }

    } catch (e) {
       console.error("Failed to fetch user info for BYOK", e);
       alert("Failed to fetch Google User Info. Check console.");
    } finally {
       setIsAddingAccount(false);
       setAuthConnectingStage('');
    }
  };

  const handleLogin = (forceSelect = false) => {
    try {
      setIsAddingAccount(true);
      setAuthConnectingStage('Waiting for account confirmation...');

      // Synchronous fast-path: if pre-initialized, fire immediately on the user gesture
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

      // If no custom Client ID is set and not in magic link, direct to Settings!
      if (!effectiveClientId) {
        setCurrentView('settings');
        setIsAddingAccount(false);
        setAuthConnectingStage('');
        return;
      }

      // BYOK FLOW (Google Identity Services)
      if ((window as any).google?.accounts?.oauth2) {
        triggerGsiLogin(effectiveClientId);
      } else {
        triggerGsiLogin(effectiveClientId);
      }
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
        scope: 'email profile openid https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
        prompt: 'consent select_account',
        callback: handleAuthCallback,
      });
      preInitializedTokenClientRef.current = client;
      client.requestAccessToken();
    } catch (e) {
      console.error("GSI Client initialization failed:", e);
      alert("Failed to initialize Google Auth. Is your Client ID valid?");
      setIsAddingAccount(false);
      setAuthConnectingStage('');
    }
  };

  const toggleAccountActive = (id: string) => {
    setActiveAccountIds(prev => {
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
      setAggregatedEmails([]);
      setAggregatedFiles([]);
      setCurrentView(pendingMagicHash ? 'drive' : 'mail');
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const launchDeepWork = (urlTemplate: string, accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account || !account.email) return;
    const url = urlTemplate.replace('{{email}}', encodeURIComponent(account.email));
    window.open(url, '_blank');
  };

  const filteredEmails = aggregatedEmails;
  const filteredFiles = aggregatedFiles;

  const decodeBase64 = (encoded: string) => {
    try {
      return decodeURIComponent(escape(atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))));
    } catch (e) {
      return atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    }
  };

  const extractAttachments = (payload: any) => {
    const attachments: { attachmentId: string; filename: string; mimeType: string; size: number }[] = [];
    const searchParts = (parts: any[]) => {
      parts.forEach(part => {
        if (part.filename && part.body && part.body.attachmentId) {
          attachments.push({
            attachmentId: part.body.attachmentId,
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size || 0
          });
        }
        if (part.parts) {
          searchParts(part.parts);
        }
      });
    };
    if (payload.parts) {
      searchParts(payload.parts);
    }
    return attachments;
  };

  const extractEmailBody = (payload: any): string => {
    let html = '';
    let text = '';
    if (payload.body?.data) {
      if (payload.mimeType === 'text/html') html = decodeBase64(payload.body.data);
      else text = decodeBase64(payload.body.data);
    } else if (payload.parts) {
      payload.parts.forEach((part: any) => {
        if (part.mimeType === 'text/html' && part.body?.data) html = decodeBase64(part.body.data);
        if (part.mimeType === 'text/plain' && part.body?.data) text = decodeBase64(part.body.data);
        if (part.parts) {
          part.parts.forEach((subPart: any) => {
            if (subPart.mimeType === 'text/html' && subPart.body?.data) html = decodeBase64(subPart.body.data);
            if (subPart.mimeType === 'text/plain' && subPart.body?.data) text = decodeBase64(subPart.body.data);
          });
        }
      });
    }
    return html || `<div style="white-space: pre-wrap; font-family: sans-serif; padding: 16px; color: #333;">${text}</div>`;
  };

  const openEmail = async (email: any) => {
    setActiveEmail(email);
    setIsEmailLoading(true);
    setEmailHtml('');
    
    const account = accounts.find(a => a.id === email.accountId);
    if (!account) return;

    try {
      const { content, attachments } = await fetchUnifiedEmailContent(account, email);
      
      // Update active email with attachments
      setActiveEmail({ ...email, attachments });
      
      // Inject some basic styles to prevent body overflow weirdness inside iframe
      const styledContent = `
        <style>
          body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; word-wrap: break-word; }
          img { max-width: 100%; height: auto; }
          a { color: #2563eb; }
        </style>
        ${content}
      `;
      setEmailHtml(styledContent);
    } catch (e) {
      console.error("Failed to load full email", e);
      setEmailHtml('<div style="padding: 20px; color: red;">Failed to load email content.</div>');
    } finally {
      setIsEmailLoading(false);
    }
  };

  const executeEmailAction = async (action: 'read' | 'archive') => {
    if (!activeEmail) return;
    const account = accounts.find(a => a.id === activeEmail.accountId);
    if (!account) return;

    try {
      await executeUnifiedEmailAction(account, activeEmail, action);
      
      // Remove from UI instantly (Optimistic update)
      setAggregatedEmails(prev => prev.filter(e => e.id !== activeEmail.id));
      setActiveEmail(null);
    } catch (e) {
      console.error(`Failed to ${action} email`, e);
    }
  };

  const executeCrossAccountTransfer = async (targetAccountId: string) => {
    if (!transferFile) return;
    const sourceAccount = accounts.find(a => a.id === transferFile.accountId);
    const targetAccount = accounts.find(a => a.id === targetAccountId);
    
    if (!sourceAccount || !targetAccount) return;

    setIsTransferring(true);
    try {
      // 1. Download blob from Source Account
      const isWorkspaceFile = transferFile.mimeType.startsWith('application/vnd.google-apps.');
      let downloadUrl = `https://www.googleapis.com/drive/v3/files/${transferFile.id}?alt=media`;
      let targetMimeType = transferFile.mimeType;
      let targetName = transferFile.name;

      // Handle Workspace exports
      if (isWorkspaceFile) {
        if (transferFile.mimeType === 'application/vnd.google-apps.document') {
          targetMimeType = 'application/pdf';
          targetName = `${transferFile.name}.pdf`;
        } else if (transferFile.mimeType === 'application/vnd.google-apps.spreadsheet') {
          targetMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; // xlsx
          targetName = `${transferFile.name}.xlsx`;
        } else if (transferFile.mimeType === 'application/vnd.google-apps.presentation') {
          targetMimeType = 'application/pdf';
          targetName = `${transferFile.name}.pdf`;
        } else {
          // Fallback to PDF for other google apps
          targetMimeType = 'application/pdf';
          targetName = `${transferFile.name}.pdf`;
        }
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${transferFile.id}/export?mimeType=${targetMimeType}`;
      }

      const fetchRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${sourceAccount.accessToken}` }
      });
      if (!fetchRes.ok) {
        const errText = await fetchRes.text();
        throw new Error(`Failed to download from source: ${errText}`);
      }
      const blob = await fetchRes.blob();

      // 2. Upload to Target Account via Multipart
      const metadata = {
        name: targetName,
        mimeType: targetMimeType
      };
      
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${targetAccount.accessToken}` },
        body: form
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Failed to upload to target: ${errText}`);
      }
      
      setTransferSuccess(true);
      setTimeout(() => {
        setTransferSuccess(false);
        setTransferFile(null);
      }, 2000);

    } catch (e) {
      console.error("Magic Transfer Failed:", e);
      alert("Transfer failed. Please check console for details.");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleAddMultiCloudAccount = (account: AccountToken) => {
    setAccounts(prev => {
      if (prev.find(a => a.id === account.id)) {
        return prev.map(a => a.id === account.id ? account : a);
      }
      return [...prev, account];
    });
    setActiveAccountIds(prev => new Set(prev).add(account.id));
  };

  const handleRemoveAccount = (id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
    setActiveAccountIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  if (isInitializing) {
    return <div className="h-screen w-screen bg-neutral-900 flex items-center justify-center text-white"><Loader2 className="animate-spin w-8 h-8 text-neutral-400" /></div>;
  }

  if (hydrationError) {
    return (
      <div className="min-h-screen w-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-white font-sans">
        <div className="bg-neutral-800 p-8 rounded-2xl max-w-md w-full text-center border border-neutral-700 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto mb-6">
             <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2">Storage Error</h2>
          <p className="text-sm text-neutral-400 mb-6">{hydrationError}</p>
          <button 
            onClick={clearStorageAndReset}
            className="w-full py-3 px-4 bg-[#0a0a0a] text-white font-bold rounded-xl hover:bg-white/20 transition-colors"
          >
            Clear Data & Re-Authenticate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#F8FAFC] font-sans text-slate-900">
      
      {/* LEFT SIDEBAR - Command Center */}
      <Sidebar 
        currentView={currentView}
        setCurrentView={(view) => { setCurrentView(view); setIsMobileMenuOpen(false); }}
        accounts={accounts}
        activeAccountIds={activeAccountIds}
        toggleAccountActive={toggleAccountActive}
        handleLogin={handleLogin}
        isAddingAccount={isAddingAccount}
        launchDeepWork={launchDeepWork}
        handleLogoutAll={handleLogoutAll}
        isMobileMenuOpen={isMobileMenuOpen}
        closeMobileMenu={() => setIsMobileMenuOpen(false)}
        onCompose={() => {
          setReplyToEmail(null);
          setIsComposeOpen(true);
        }}
        onAddMultiCloudAccount={(provider) => setConnectModalProvider(provider || 'onedrive')}
      />

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#F8FAFC]">
        
        {/* Top Header (Global Search & Actions) */}
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
                placeholder="Search messages, files & commands... (Press ⌘K)" 
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
              <span>Zero-Server Mode</span>
            </div>
          </div>
        </div>

        {/* Workspace Guidance Strip (Shown when 0 accounts connected) */}
        {accounts.length === 0 && (
          <div className="bg-slate-100/70 border-b border-slate-200/90 px-4 md:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2 text-slate-700">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="font-semibold text-slate-900">Workspace Ready:</span>
              <span>Connect your Google Drive, OneDrive, or Dropbox accounts to stream live messages and pool storage. No provider is mandatory.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleLogin(false)}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg font-semibold text-[11px] shadow-2xs transition-colors cursor-pointer"
              >
                + Google (15 GB)
              </button>
              <button
                onClick={() => setConnectModalProvider('onedrive')}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-blue-700 rounded-lg font-semibold text-[11px] shadow-2xs transition-colors cursor-pointer"
              >
                + OneDrive (5 GB)
              </button>
              <button
                onClick={() => setConnectModalProvider('dropbox')}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-sky-700 rounded-lg font-semibold text-[11px] shadow-2xs transition-colors cursor-pointer"
              >
                + Dropbox (2 GB)
              </button>
              <button
                onClick={() => setActiveStaticPage('about')}
                className="px-2.5 py-1 text-slate-500 hover:text-slate-800 font-medium text-[11px] transition-colors cursor-pointer"
              >
                Architecture
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Views */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative bg-[#F8FAFC]">
          
          <ErrorBoundary>
              <GlobalSearchView 
                query={searchQuery}
                accounts={accounts.filter(a => activeAccountIds.has(a.id))}
                onClose={() => setSearchQuery('')}
                openEmail={openEmail}
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
                {currentView === 'dashboard' && (
                  <div className="absolute inset-0 bg-[#F8FAFC] flex-col overflow-y-auto flex">
                    <DashboardView 
                      accounts={accounts}
                      filteredEmails={filteredEmails}
                      filteredFiles={filteredFiles}
                      handleLogin={handleLogin}
                      setCurrentView={setCurrentView}
                      openEmail={openEmail}
                    />
                  </div>
                )}
                {currentView === 'mail' && (
                  <div className="absolute inset-0 bg-[#F8FAFC] flex">
                    <MailView 
                      activeAccountIds={activeAccountIds}
                      isLoadingStreams={isLoadingStreams}
                      filteredEmails={filteredEmails}
                      activeEmail={activeEmail}
                      openEmail={openEmail}
                      setActiveEmail={setActiveEmail}
                      executeEmailAction={executeEmailAction}
                      isEmailLoading={isEmailLoading}
                      emailHtml={emailHtml}
                      onAutomateSender={(email) => setAutomateEmail(email)}
                      onReply={(email) => {
                        setReplyToEmail(email);
                        setIsComposeOpen(true);
                      }}
                      onSaveAttachmentToDrive={(email, attachment) => {
                        setAttachmentToSave({ email, attachment });
                      }}
                    />
                  </div>
                )}
                {currentView === 'drive' && (
                  <div className="absolute inset-0 bg-[#F8FAFC] flex-col overflow-y-auto flex">
                    <DriveView 
                      accounts={accounts}
                      activeAccountIds={activeAccountIds}
                      isLoadingStreams={isLoadingStreams}
                      filteredFiles={filteredFiles}
                      setTransferFile={setTransferFile}
                      onAttachToEmail={(file) => {
                        setFileToAttach(file);
                        setReplyToEmail(null);
                        setIsComposeOpen(true);
                      }}
                    />
                  </div>
                )}
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
                
                {currentView === 'automation' && (
                  <div className="absolute inset-0 bg-[#F8FAFC] flex-col overflow-y-auto flex">
                    <AutomationView accounts={accounts} />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </div>

        {/* MOBILE BOTTOM NAVIGATION */}
        <div className="md:hidden h-16 bg-white border-t border-slate-200 flex items-center justify-around shrink-0 px-2 pb-safe z-50 shadow-xs">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${currentView === 'dashboard' ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px]">Home</span>
          </button>
          <button 
            onClick={() => setCurrentView('mail')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${currentView === 'mail' ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}
          >
            <Mail className="w-5 h-5" />
            <span className="text-[10px]">Mail</span>
          </button>
          <button 
            onClick={() => setCurrentView('drive')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${currentView === 'drive' ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-[10px]">Drive</span>
          </button>
          <button 
            onClick={() => setCurrentView('automation')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${currentView === 'automation' ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}
          >
            <Zap className="w-5 h-5" />
            <span className="text-[10px]">Auto</span>
          </button>
          <button 
            onClick={() => document.getElementById('mobile-accounts-drawer')?.classList.toggle('hidden')}
            className="flex flex-col items-center justify-center w-full h-full gap-1 text-slate-400"
          >
            <Layers className="w-5 h-5" />
            <span className="text-[10px]">Accounts</span>
          </button>
        </div>

        {/* Mobile Accounts Drawer */}
        <div id="mobile-accounts-drawer" className="hidden md:hidden absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white rounded-t-2xl p-6 max-h-[80vh] overflow-y-auto border-t border-slate-200 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-900 text-sm">Active Accounts</h3>
              <button onClick={() => document.getElementById('mobile-accounts-drawer')?.classList.add('hidden')} className="text-xs font-semibold text-slate-500">Done</button>
            </div>
            <div className="space-y-2">
              {accounts.map(acc => {
                const isActive = activeAccountIds.has(acc.id);
                return (
                  <div key={acc.id} onClick={() => toggleAccountActive(acc.id)} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <div className="shrink-0">
                      {isActive ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs truncate font-medium ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>{acc.email}</div>
                    </div>
                    {acc.photoURL && <img src={acc.photoURL} alt="" className={`w-5 h-5 rounded-full shrink-0 ${isActive ? 'opacity-100' : 'opacity-40'}`} />}
                  </div>
                );
              })}
            </div>
            <button 
              onClick={() => handleLogin(true)}
              disabled={isAddingAccount}
              className="mt-5 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isAddingAccount ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Another Account
            </button>
            <button 
              onClick={() => {
                setCurrentView('settings');
                document.getElementById('mobile-accounts-drawer')?.classList.add('hidden');
              }}
              className="mt-2.5 w-full py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
            >
              <Layers size={14} /> Security & Settings (BYOK)
            </button>
          </div>
        </div>

        {/* MAGIC TRANSFER MODAL */}
        <TransferModal 
          transferFile={transferFile}
          setTransferFile={setTransferFile}
          isTransferring={isTransferring}
          transferSuccess={transferSuccess}
          accounts={accounts}
          executeCrossAccountTransfer={executeCrossAccountTransfer}
        />

      </div>
      {/* Modals */}
      <SaveAttachmentModal 
        isOpen={!!attachmentToSave} 
        onClose={() => setAttachmentToSave(null)}
        accounts={accounts}
        email={attachmentToSave?.email || null}
        attachment={attachmentToSave?.attachment || null}
      />
      
      {/* Automate Specific Sender Modal */}
      {automateEmail && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                Automate This Sender
              </h3>
              <button onClick={() => setAutomateEmail(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">If I receive an email exactly from:</p>
                <div className="px-3 py-2 bg-slate-50 rounded-lg text-sm font-mono text-slate-700 border border-slate-200">
                  {(() => {
                    const fromHeader = automateEmail.payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value || '';
                    const match = fromHeader.match(/<([^>]+)>/);
                    return match ? match[1] : fromHeader;
                  })()}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Forward to Email:</label>
                <input
                  type="email"
                  value={automateTarget}
                  onChange={e => setAutomateTarget(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                  placeholder="e.g. main.account@gmail.com"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={async () => {
                    const fromHeader = automateEmail.payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value || '';
                    const match = fromHeader.match(/<([^>]+)>/);
                    const exactEmail = match ? match[1] : fromHeader;
                    if (!exactEmail || !automateTarget) return;

                    const newRule = {
                      id: crypto.randomUUID(),
                      name: `Forward ${exactEmail}`,
                      sourceAccountId: automateEmail.accountId,
                      trigger: 'ON_NEW_EMAIL',
                      conditions: [
                        { id: crypto.randomUUID(), field: 'from', operator: 'equals', value: exactEmail }
                      ],
                      actions: [
                        { id: crypto.randomUUID(), type: 'FORWARD_EMAIL', targetEmail: automateTarget }
                      ],
                      createdAt: Date.now(),
                      isActive: true
                    };
                    
                    const { get, set } = await import('idb-keyval');
                    const existingRules = (await get('automation_rules')) || [];
                    await set('automation_rules', [...existingRules, newRule]);
                    
                    setAutomateEmail(null);
                    setAutomateTarget('');
                    setCurrentView('automation'); // Take them to view it!
                  }}
                  disabled={!automateTarget}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-sm shadow-sm transition-colors cursor-pointer"
                >
                  Create Rule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ComposeModal 
        isOpen={isComposeOpen} 
        onClose={() => {
          setIsComposeOpen(false);
          setFileToAttach(null);
        }} 
        accounts={accounts} 
        replyToEmail={replyToEmail}
        initialDriveFile={fileToAttach}
      />

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
                  <p className="text-emerald-400 font-medium text-sm mb-6">100% Zero-Server. Your data never leaves your browser.</p>
                  <h3 className="text-lg font-bold mt-6 mb-2">1. Zero-Server Architecture</h3>
                  <p className="text-neutral-400 text-xs leading-relaxed mb-4">
                    Matrix Workspace is built on a strictly local, serverless architecture. We do not operate backend servers, databases, or analytics trackers that collect your email content or Drive files. All OAuth tokens and aggregated data are stored exclusively in your browser's local storage (IndexedDB).
                  </p>
                  <h3 className="text-lg font-bold mt-6 mb-2">2. Multi-Cloud API Usage</h3>
                  <p className="text-neutral-400 text-xs leading-relaxed mb-4">
                    Our application communicates directly with Google, Microsoft, and Dropbox APIs solely to provide unified mail and distributed drive sharding. No intermediary server intercepts your tokens or data.
                  </p>
                </>
              )}

              {activeStaticPage === 'terms' && (
                <>
                  <h1 className="text-2xl md:text-3xl font-black mb-4">Terms of Service</h1>
                  <p className="text-neutral-400 text-xs leading-relaxed mb-4">
                    By using Matrix Workspace, you agree to these terms. This is a local-first utility provided "as is" without warranty. All data operations are executed directly inside your browser client.
                  </p>
                </>
              )}

              {activeStaticPage === 'about' && (
                <>
                  <h1 className="text-2xl md:text-3xl font-black mb-4">System Architecture</h1>
                  <p className="text-neutral-400 text-xs leading-relaxed mb-4">
                    Matrix Workspace is an open, sovereign multi-cloud orchestrator. It bridges Google Drive, Microsoft OneDrive, and Dropbox into a unified virtual RAID-5 drive with AES-256-GCM encryption, XOR erasure coding, and decentralized magic link file transfer.
                  </p>
                </>
              )}

              {activeStaticPage === 'security' && (
                <>
                  <h1 className="text-2xl md:text-3xl font-black mb-4">Zero-Server & Sovereign</h1>
                  <p className="text-neutral-400 text-xs leading-relaxed mb-6">
                    100% Free, Open-Source, and Local-First. Your credentials, encryption keys, and private data never touch any intermediary backend.
                  </p>
                  <div className="space-y-3">
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs">
                      <strong>Zero Relay Backend:</strong> Direct browser connection to Google, OneDrive, and Dropbox.
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs">
                      <strong>AES-256-GCM Encryption:</strong> Chunks are encrypted with keys derived locally in your browser.
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs">
                      <strong>XOR RAID-5 Parity:</strong> Outage resilience through client-side erasure coding across heterogeneous clouds.
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        emails={filteredEmails}
        files={filteredFiles}
        onNavigate={(view) => setCurrentView(view)}
        onOpenEmail={(email) => {
          openEmail(email);
          setCurrentView('mail');
        }}
        onOpenCompose={() => {
          setReplyToEmail(null);
          setIsComposeOpen(true);
        }}
        onTriggerUpload={() => {
          setCurrentView('drive');
          handleUploadSampleTestAsset();
        }}
        onOpenConnect={(provider) => setConnectModalProvider(provider || 'onedrive')}
      />

    </div>
  );
}
