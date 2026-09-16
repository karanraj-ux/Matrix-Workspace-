import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Layers, Search, Plus, CheckSquare, Square, Mail, FileText, ExternalLink, LogOut, Loader2, Play, Download, SortDesc, SortAsc, X, Archive, MailOpen, Reply, ArrowRightLeft, CheckCircle2, AlertCircle, LayoutDashboard, Menu } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { logout } from './auth';

import { fetchDriveFiles, fetchGmailMessages, syncConfigToShadowDb, fetchConfigFromShadowDb } from './services/googleService';
import { AccountToken, GmailMessage, DriveFile } from './types';
import { AutomationRule } from './types/automation';
import { get, set } from 'idb-keyval';

import { Sidebar } from './components/Sidebar';
import { UpgradeModal } from './components/UpgradeModal';
import { TransferModal } from './components/TransferModal';
import { ErrorBoundary } from './components/ErrorBoundary';

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
  const [automateFeedback, setAutomateFeedback] = useState('');

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

  // Settings & Upgrades
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [activeStaticPage, setActiveStaticPage] = useState<'privacy' | 'terms' | 'about' | null>(null);

  // Email Reader State
  const [activeEmail, setActiveEmail] = useState<any | null>(null);
  const [emailHtml, setEmailHtml] = useState<string>('');
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  // Magic Transfer State
  const [transferFile, setTransferFile] = useState<any | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);

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
          const res = await fetchGmailMessages(acc, handleTokenExpiry);
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

  const handleLogin = async (forceSelect = false) => {
    try {
      setIsAddingAccount(true);
      
      // If no custom Client ID is set, direct to Settings!
      if (!customClientId || !customClientId.trim()) {
        setCurrentView('settings');
        setIsAddingAccount(false);
        return;
      }

      // BYOK FLOW (Google Identity Services)
      if (!document.getElementById('gsi-script')) {
        const script = document.createElement('script');
        script.id = 'gsi-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => triggerGsiLogin();
        document.body.appendChild(script);
      } else {
        triggerGsiLogin();
      }
    } catch (error) {
      console.error(error);
      setIsAddingAccount(false);
    }
  };

  const triggerGsiLogin = () => {
    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: customClientId.trim(),
        scope: 'email profile openid https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
        prompt: 'consent select_account',
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
             console.error("BYOK Login Error:", tokenResponse);
             setIsAddingAccount(false);
             return;
          }
          
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

             if (isFirstAccount) {
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
          }
        }
      });
      client.requestAccessToken();
    } catch (e) {
      console.error("GSI Client initialization failed:", e);
      alert("Failed to initialize Google Auth. Is your Client ID valid?");
      setIsAddingAccount(false);
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
      setCurrentView('mail');
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
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${email.id}?format=full`, {
        headers: { Authorization: `Bearer ${account.accessToken}` }
      });
      const data = await res.json();
      const content = extractEmailBody(data.payload);
      const attachments = extractAttachments(data.payload);
      
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

    const payload = action === 'read' 
      ? { removeLabelIds: ['UNREAD'] } 
      : { removeLabelIds: ['UNREAD', 'INBOX'] }; // Archive also marks as read

    try {
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${activeEmail.id}/modify`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
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

  if (accounts.length === 0 && currentView !== 'settings') {
    return (
      <div className="min-h-screen w-screen flex flex-col bg-[#111111] text-white font-sans">
        
        {/* Navbar */}
        <header className="sticky top-0 z-50 h-16 px-6 border-b border-white/10 bg-[#0a0a0a] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold tracking-tight">Matrix Workspace</span>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-neutral-500">
            <button onClick={() => setActiveStaticPage('about')} className="hover:text-white transition-colors hidden sm:block">Architecture</button>
            <button onClick={() => setActiveStaticPage('pricing')} className="bg-white hover:bg-neutral-800 text-white px-4 py-1.5 rounded-full transition-colors font-bold text-xs flex items-center gap-2">
              Get Lifetime Access
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-white/10">
               <Layers className="w-8 h-8 text-neutral-200" />
            </div>
            
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.1] text-white">
              Unified Workspace
            </h1>
            
            <p className="text-lg text-neutral-500 max-w-xl mx-auto leading-relaxed">
              Connect your Google, OneDrive, and Dropbox accounts to access Mail, Distributed Drive, and Automations in a single secure, client-side dashboard. 
            </p>
            
            <div className="pt-6 flex flex-col items-center gap-4">
              <button 
                onClick={() => handleLogin(false)}
                disabled={isAddingAccount}
                className="py-3.5 px-8 bg-white hover:bg-neutral-800 text-white rounded-xl font-bold text-base transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-3 disabled:opacity-70 disabled:hover:translate-y-0 w-full md:w-auto"
              >
                {isAddingAccount ? <Loader2 className="animate-spin w-5 h-5" /> : 'Connect Google Account'}
              </button>
              <div className="flex items-center gap-2 text-xs text-neutral-400 font-medium mt-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-neutral-400" />
                100% Client-Side. Your data never leaves the browser.
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-8 border-t border-white/10 bg-[#0a0a0a] mt-auto">
          <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-neutral-500 font-medium">© 2026 Matrix Workspace. Built for power users.</div>
            <div className="flex gap-6 text-sm text-neutral-500 font-medium">
              <button onClick={() => setActiveStaticPage('privacy')} className="hover:text-white transition-colors">Privacy Policy</button>
              <button onClick={() => setActiveStaticPage('terms')} className="hover:text-white transition-colors">Terms of Service</button>
              <a href="mailto:kr378434@gmail.com" className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>
        </footer>

        {/* Static Page Modals overlay over the landing page */}
        {activeStaticPage && (
          <div className="fixed inset-0 z-50 bg-[#0a0a0a] overflow-y-auto animate-in slide-in-from-bottom-8">
             <div className="max-w-3xl mx-auto p-8 md:p-12 relative">
               <button onClick={() => setActiveStaticPage(null)} className="fixed top-6 right-6 p-3 bg-white/5 hover:bg-white/20 rounded-full transition-colors z-10">
                 <X className="w-5 h-5" />
               </button>
               
               <div className="prose prose-neutral max-w-none font-sans">
                 {activeStaticPage === 'privacy' && (
                   <>
                     <h1 className="text-4xl font-black mb-8">Privacy Policy</h1>
                     <p className="lead text-xl text-neutral-400 mb-8">Your data never leaves your browser.</p>
                     
                     <h3 className="text-2xl font-bold mt-8 mb-4">1. Zero-Server Architecture</h3>
                     <p className="text-neutral-400 mb-6">Matrix Workspace is built on a strictly local, serverless architecture. We do not operate backend servers, databases, or analytics trackers that collect your email content, or Drive files. All OAuth tokens and aggregated data are stored exclusively in your browser's local storage (IndexedDB).</p>
                     
                     <h3 className="text-2xl font-bold mt-8 mb-4">2. Google API Services Usage</h3>
                     <p className="text-neutral-400 mb-6">Our application requests read-only access to your Gmail, and full access to your Google Drive (strictly to enable the Cross-Account Magic Transfer feature). We do not transmit this data to any third party. The data flows directly from Google's servers to your local machine.</p>

                     <h3 className="text-2xl font-bold mt-8 mb-4">3. Enterprise BYOK (Bring Your Own Key)</h3>
                     <p className="text-neutral-400 mb-6">Users who opt into the Enterprise BYOK program utilize their own Google Cloud Credentials. In this mode, Matrix Workspace acts purely as a client-side interface framework, and you maintain complete administrative control over the API quotas and security logs within your own Google Cloud Console.</p>
                   </>
                 )}
                 
                 {activeStaticPage === 'terms' && (
                   <>
                     <h1 className="text-4xl font-black mb-8">Terms of Service</h1>
                     <p className="text-neutral-400 mb-6">By using Matrix Workspace, you agree to these terms. This is a beta utility provided "as is" without warranty. We are not responsible for accidental data deletion or file misrouting caused by user error during cross-account transfers.</p>
                   </>
                 )}

                 {activeStaticPage === 'about' && (
                   <>
                     <h1 className="text-4xl font-black mb-8">System Architecture</h1>
                     <p className="text-neutral-400 mb-6">Matrix Workspace is a strictly client-side React boilerplate designed for developers to aggregate Google services without relying on backend servers.</p>
                     <p className="text-neutral-400 mb-6">By utilizing Google Identity Services (GSI) and IndexedDB, this template manages multiple OAuth tokens concurrently within the browser memory. This guarantees that private emails and files are never transmitted to third-party databases, making it the perfect foundation for privacy-first SaaS products and internal tools.</p>
                   </>
                 )}

                 {activeStaticPage === 'pricing' && (
                   <>
                     <h1 className="text-4xl font-black mb-6">Unlock Matrix Workspace.</h1>
                     <p className="text-xl text-neutral-400 mb-10 leading-relaxed">
                       Stop logging in and out of different Chrome profiles. Aggregate all your client inboxes and files into a single, secure dashboard.
                     </p>
                     
                     <div className="grid md:grid-cols-2 gap-8">
                       <div className="border border-white/10 bg-[#111111] rounded-2xl p-8 flex flex-col shadow-sm">
                         <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-white">
                           <Layers className="w-5 h-5 text-neutral-500" /> What's included?
                         </h3>
                         <ul className="space-y-4 text-sm font-medium text-neutral-400 flex-1">
                           <li className="flex gap-3 items-start"><CheckCircle2 className="w-5 h-5 text-white shrink-0 mt-0.5" /> <span><strong>Unified Inbox.</strong> Read emails from up to 5 accounts at once.</span></li>
                           <li className="flex gap-3 items-start"><CheckCircle2 className="w-5 h-5 text-white shrink-0 mt-0.5" /> <span><strong>Zero-Server File Transfers.</strong> Move files between Google Drives seamlessly.</span></li>
                           <li className="flex gap-3 items-start"><CheckCircle2 className="w-5 h-5 text-white shrink-0 mt-0.5" /> <span><strong>Multi-Cloud Storage.</strong> Stripe & encrypt across Google, OneDrive, Dropbox.</span></li>
                           <li className="flex gap-3 items-start"><CheckCircle2 className="w-5 h-5 text-white shrink-0 mt-0.5" /> <span><strong>100% Client-Side Privacy.</strong> Your data never touches our servers.</span></li>
                         </ul>
                       </div>
                       
                       <div className="border border-white/10 bg-[#0a0a0a] rounded-2xl p-8 shadow-xl relative overflow-hidden flex flex-col group hover:border-black transition-colors">
                         <h3 className="text-neutral-500 font-semibold mb-2 uppercase tracking-wide text-xs">Early Adopter</h3>
                         <div className="flex items-baseline gap-1 mb-4">
                           <span className="text-5xl font-black text-white">$49</span>
                           <span className="text-neutral-400 font-medium">USD</span>
                         </div>
                         <p className="text-sm text-neutral-500 mb-8 leading-relaxed">
                           One-time payment for lifetime access. Use your own Google Cloud API key (BYOK) for unlimited usage.
                         </p>
                         
                         <a href="https://gumroad.com" target="_blank" rel="noopener noreferrer" className="mt-auto py-3.5 px-6 bg-white hover:bg-neutral-800 text-white rounded-xl font-bold text-center transition-all shadow-md group-hover:shadow-lg flex items-center justify-center gap-2">
                           Get Lifetime Access &rarr;
                         </a>
                       </div>
                     </div>
                   </>
                 )}
               </div>
             </div>
          </div>
        )}
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
        onAddMultiCloudAccount={() => setCurrentView('settings')}
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
            
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search messages & files across accounts... (Press ⌘K)" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200/90 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] font-medium text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Zero-Server Mode</span>
            </div>
          </div>
        </div>

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
      <UpgradeModal 
        showUpgradeModal={showUpgradeModal} 
        setShowUpgradeModal={setShowUpgradeModal} 
        setCurrentView={setCurrentView} 
      />

    </div>
  );
}
