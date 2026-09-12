import React, { useState, useEffect } from 'react';
import { Layers, Search, Plus, CheckSquare, Square, Mail, FileText, Calendar, ExternalLink, LogOut, Loader2, Play, Download, SortDesc, SortAsc, X, Archive, MailOpen, Reply, ArrowRightLeft, CheckCircle2, AlertCircle, LayoutDashboard } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { logout } from './auth';

import { fetchDriveFiles, fetchGmailMessages, fetchCalendarEvents } from './services/googleService';
import { AccountToken, GmailMessage, DriveFile, CalendarEvent } from './types';

import { Sidebar } from './components/Sidebar';
import { UpgradeModal } from './components/UpgradeModal';
import { TransferModal } from './components/TransferModal';
import { ErrorBoundary } from './components/ErrorBoundary';

import { MailView } from './views/MailView';
import { DriveView } from './views/DriveView';
import { SettingsView } from './views/SettingsView';
import { CalendarView } from './views/CalendarView';
import { DashboardView } from './views/DashboardView';
import { useAccountPersistence } from './hooks/useAccountPersistence';

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

  // App State
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'mail' | 'drive' | 'calendar' | 'settings'>('dashboard');

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
  const [aggregatedEvents, setAggregatedEvents] = useState<any[]>([]);
  const [isLoadingStreams, setIsLoadingStreams] = useState(false);

  const handleTokenExpiry = (accountId: string) => {
    setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, isExpired: true } : a));
  };

  useEffect(() => {
    const fetchStreams = async () => {
      if (activeAccountIds.size === 0) {
        setAggregatedEmails([]);
        setAggregatedFiles([]);
        setAggregatedEvents([]);
        return;
      }

      setIsLoadingStreams(true);
      const activeAccounts = accounts.filter(a => activeAccountIds.has(a.id));

      try {
        const drivePromises = activeAccounts.map(acc => fetchDriveFiles(acc, handleTokenExpiry));
        const gmailPromises = activeAccounts.map(acc => fetchGmailMessages(acc, handleTokenExpiry));
        const calendarPromises = activeAccounts.map(acc => fetchCalendarEvents(acc, handleTokenExpiry));

        const [driveResults, gmailResults, calendarResults] = await Promise.all([
          Promise.all(drivePromises),
          Promise.all(gmailPromises),
          Promise.all(calendarPromises)
        ]);

        const flatDrive = driveResults.flat().sort((a, b) => b.timestamp - a.timestamp);
        const flatGmail = gmailResults.flat().sort((a, b) => b.timestamp - a.timestamp);
        const flatCalendar = calendarResults.flat().sort((a, b) => a.timestamp - b.timestamp); // Ascending for upcoming events

        setAggregatedFiles(flatDrive);
        setAggregatedEmails(flatGmail);
        setAggregatedEvents(flatCalendar);
      } catch (error) {
        console.error("Error fetching streams:", error);
      } finally {
        setIsLoadingStreams(false);
      }
    };

    fetchStreams();
  }, [activeAccountIds, accounts]);

  const handleLogin = async (forceSelect = false) => {
    try {
      setIsAddingAccount(true);
      
      // If no custom Client ID is set, direct to Settings!
      if (!customClientId || !customClientId.trim()) {
        setCurrentView('settings');
        alert('Please enter your Google OAuth Client ID in Settings to connect your accounts.');
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
        scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.readonly',
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
             const userInfo = await userInfoRes.json();
             
             if (!userInfo.sub) throw new Error("No user ID found in Google UserInfo");

             const newAccount: AccountToken = {
               id: userInfo.sub,
               email: userInfo.email,
               name: userInfo.name,
               photoURL: userInfo.picture,
               accessToken: accessToken
             };

             setAccounts(prev => {
                if (prev.find(a => a.id === newAccount.id)) {
                  return prev.map(a => a.id === newAccount.id ? newAccount : a);
                }
                return [...prev, newAccount];
             });
             setActiveAccountIds(prev => new Set(prev).add(newAccount.id));

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
      setAggregatedEvents([]);
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

  const q = searchQuery.toLowerCase();
  const filteredEmails = aggregatedEmails.filter(e => 
    (e.subject || '').toLowerCase().includes(q) || 
    (e.from || '').toLowerCase().includes(q) || 
    (e.snippet || '').toLowerCase().includes(q)
  );
  
  const filteredFiles = aggregatedFiles.filter(f => 
    (f.name || '').toLowerCase().includes(q)
  );
  
  const filteredEvents = aggregatedEvents.filter(e => 
    (e.summary || '').toLowerCase().includes(q)
  );

  const decodeBase64 = (encoded: string) => {
    try {
      return decodeURIComponent(escape(atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))));
    } catch (e) {
      return atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    }
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
            className="w-full py-3 px-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors"
          >
            Clear Data & Re-Authenticate
          </button>
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="min-h-screen w-screen flex flex-col bg-neutral-50 text-neutral-900 font-sans">
        
        {/* Navbar */}
        <header className="h-16 px-6 border-b border-neutral-200 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold tracking-tight">Matrix Workspace</span>
          </div>
          <div className="flex gap-4 text-sm font-medium text-neutral-500">
            <button onClick={() => setActiveStaticPage('about')} className="hover:text-black transition-colors">About</button>
            <button onClick={() => setActiveStaticPage('pricing')} className="hover:text-black transition-colors">Pricing</button>
          </div>
        </header>

        {/* Hero Section */}
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider mb-4 border border-blue-100">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              Limited Beta: 50 Seats Remaining
            </div>
            
            <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] text-neutral-900">
              Stop switching <br className="hidden md:block"/> Chrome profiles.
            </h1>
            
            <p className="text-lg md:text-xl text-neutral-500 max-w-2xl mx-auto leading-relaxed">
              The zero-server, high-density dashboard for Agency Owners. 
              Read 5 inboxes, cross-transfer Drive files, and merge your calendars into a single secure viewport.
            </p>
            
            <div className="pt-8 flex flex-col items-center gap-4">
              <button 
                onClick={() => handleLogin(false)}
                disabled={isAddingAccount}
                className="py-4 px-8 bg-black hover:bg-neutral-800 text-white rounded-xl font-bold text-lg transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 flex items-center justify-center gap-3 disabled:opacity-70 disabled:hover:translate-y-0 w-full md:w-auto"
              >
                {isAddingAccount ? <Loader2 className="animate-spin w-5 h-5" /> : 'Connect Google Workspace'}
              </button>
              <div className="flex items-center gap-2 text-sm text-neutral-400 font-medium">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                No backend servers. 100% private.
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-8 border-t border-neutral-200 bg-white mt-auto">
          <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-neutral-500 font-medium">© 2026 Matrix Workspace. Built for power users.</div>
            <div className="flex gap-6 text-sm text-neutral-500 font-medium">
              <button onClick={() => setActiveStaticPage('privacy')} className="hover:text-black transition-colors">Privacy Policy</button>
              <button onClick={() => setActiveStaticPage('terms')} className="hover:text-black transition-colors">Terms of Service</button>
              <a href="mailto:founder@example.com" className="hover:text-black transition-colors">Contact</a>
            </div>
          </div>
        </footer>

        {/* Static Page Modals overlay over the landing page */}
        {activeStaticPage && (
          <div className="fixed inset-0 z-50 bg-white overflow-y-auto animate-in slide-in-from-bottom-8">
             <div className="max-w-3xl mx-auto p-8 md:p-12 relative">
               <button onClick={() => setActiveStaticPage(null)} className="fixed top-6 right-6 p-3 bg-neutral-100 hover:bg-neutral-200 rounded-full transition-colors z-10">
                 <X className="w-5 h-5" />
               </button>
               
               <div className="prose prose-neutral max-w-none font-sans">
                 {activeStaticPage === 'privacy' && (
                   <>
                     <h1 className="text-4xl font-black mb-8">Privacy Policy</h1>
                     <p className="lead text-xl text-neutral-600 mb-8">Your data never leaves your browser.</p>
                     
                     <h3 className="text-2xl font-bold mt-8 mb-4">1. Zero-Server Architecture</h3>
                     <p className="text-neutral-600 mb-6">Matrix Workspace is built on a strictly local, serverless architecture. We do not operate backend servers, databases, or analytics trackers that collect your email content, calendar events, or Drive files. All OAuth tokens and aggregated data are stored exclusively in your browser's local storage (IndexedDB).</p>
                     
                     <h3 className="text-2xl font-bold mt-8 mb-4">2. Google API Services Usage</h3>
                     <p className="text-neutral-600 mb-6">Our application requests read-only access to your Gmail and Calendar, and full access to your Google Drive (strictly to enable the Cross-Account Magic Transfer feature). We do not transmit this data to any third party. The data flows directly from Google's servers to your local machine.</p>

                     <h3 className="text-2xl font-bold mt-8 mb-4">3. Enterprise BYOK (Bring Your Own Key)</h3>
                     <p className="text-neutral-600 mb-6">Users who opt into the Enterprise BYOK program utilize their own Google Cloud Credentials. In this mode, Matrix Workspace acts purely as a client-side interface framework, and you maintain complete administrative control over the API quotas and security logs within your own Google Cloud Console.</p>
                   </>
                 )}
                 
                 {activeStaticPage === 'terms' && (
                   <>
                     <h1 className="text-4xl font-black mb-8">Terms of Service</h1>
                     <p className="text-neutral-600 mb-6">By using Matrix Workspace, you agree to these terms. This is a beta utility provided "as is" without warranty. We are not responsible for accidental data deletion or file misrouting caused by user error during cross-account transfers.</p>
                   </>
                 )}

                 {activeStaticPage === 'about' && (
                   <>
                     <h1 className="text-4xl font-black mb-8">About Matrix</h1>
                     <p className="text-neutral-600 mb-6">Matrix was built by founders who were exhausted by the constant friction of logging in and out of 6 different Google Chrome profiles just to check client emails and transfer invoice PDFs.</p>
                     <p className="text-neutral-600 mb-6">We realized that 99% of "API aggregators" on the market steal your data and sell it to third parties. We wanted a clean, secure, localized dashboard. So we built one.</p>
                   </>
                 )}

                 {activeStaticPage === 'pricing' && (
                   <>
                     <h1 className="text-4xl font-black mb-8">Enterprise Pricing</h1>
                     <div className="grid md:grid-cols-2 gap-8 mt-12">
                       <div className="border-2 border-neutral-200 rounded-2xl p-8">
                         <h3 className="text-xl font-bold mb-2">Early Beta</h3>
                         <div className="text-4xl font-black mb-4">Free</div>
                         <p className="text-neutral-500 mb-6">Limited to 50 active users to respect shared API quotas.</p>
                         <ul className="space-y-3 font-medium text-neutral-700">
                           <li>• Max 2 Connected Accounts</li>
                           <li>• Unified Inbox</li>
                           <li>• Standard Transfer Speed</li>
                         </ul>
                       </div>
                       <div className="border-2 border-black bg-black text-white rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                         <div className="absolute top-4 right-4 bg-white text-black text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Unlimited</div>
                         <h3 className="text-xl font-bold mb-2 text-neutral-300">Enterprise BYOK</h3>
                         <div className="text-4xl font-black mb-4">$49<span className="text-lg text-neutral-400 font-normal">/mo</span></div>
                         <p className="text-neutral-400 mb-6">Bypass all restrictions using your own Google Cloud API Key.</p>
                         <ul className="space-y-3 font-medium text-neutral-300">
                           <li>• Unlimited Accounts</li>
                           <li>• 100% Private (Your Key)</li>
                           <li>• Priority Feature Access</li>
                         </ul>
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
    <div className="h-screen w-screen flex overflow-hidden bg-neutral-100 font-sans text-neutral-900">
      
      {/* LEFT SIDEBAR (Dark Mode Command Center) - Hidden on Mobile */}
      <Sidebar 
        currentView={currentView}
        setCurrentView={setCurrentView}
        accounts={accounts}
        activeAccountIds={activeAccountIds}
        toggleAccountActive={toggleAccountActive}
        handleLogin={handleLogin}
        isAddingAccount={isAddingAccount}
        launchDeepWork={launchDeepWork}
        handleLogoutAll={handleLogoutAll}
      />

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white">
        
        {/* Top Header (Global Search) */}
        <div className="h-16 bg-white border-b border-neutral-200 px-6 flex items-center shrink-0">
          <div className="flex-1 max-w-3xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input 
              type="text" 
              placeholder="Search across all connected accounts..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-neutral-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all outline-none"
            />
          </div>
        </div>

        {/* Dynamic Views */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
          <ErrorBoundary>
            {/* Dashboard View */}
            <div className={`absolute inset-0 bg-neutral-50 flex-col overflow-y-auto ${currentView === 'dashboard' ? 'flex' : 'hidden'}`}>
              <DashboardView 
                accounts={accounts}
                filteredEmails={filteredEmails}
                filteredFiles={filteredFiles}
                filteredEvents={filteredEvents}
                handleLogin={handleLogin}
                setCurrentView={setCurrentView}
              />
            </div>

            {/* Mail View */}
            <div className={`absolute inset-0 bg-white flex ${currentView === 'mail' ? 'block' : 'hidden'}`}>
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
              />
            </div>

            {/* Drive View */}
            <div className={`absolute inset-0 bg-neutral-50 flex-col overflow-y-auto ${currentView === 'drive' ? 'flex' : 'hidden'}`}>
              <DriveView 
                activeAccountIds={activeAccountIds}
                isLoadingStreams={isLoadingStreams}
                filteredFiles={filteredFiles}
                setTransferFile={setTransferFile}
              />
            </div>

            {/* Settings View (BYOK) */}
            <div className={`absolute inset-0 bg-neutral-50 flex-col overflow-y-auto ${currentView === 'settings' ? 'flex' : 'hidden'}`}>
              <SettingsView 
                isByokMode={isByokMode}
                setIsByokMode={setIsByokMode}
                customClientId={customClientId}
                setCustomClientId={setCustomClientId}
              />
            </div>

            {/* Calendar View */}
            <div className={`absolute inset-0 bg-neutral-50 flex-col overflow-y-auto ${currentView === 'calendar' ? 'flex' : 'hidden'}`}>
              <CalendarView 
                activeAccountIds={activeAccountIds}
                isLoadingStreams={isLoadingStreams}
                filteredEvents={filteredEvents}
              />
            </div>
          </ErrorBoundary>
        </div>

        {/* MOBILE BOTTOM NAVIGATION */}
        <div className="md:hidden h-16 bg-white border-t border-neutral-200 flex items-center justify-around shrink-0 px-2 pb-safe z-50">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${currentView === 'dashboard' ? 'text-indigo-600' : 'text-neutral-400'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px] font-medium">Home</span>
          </button>
          <button 
            onClick={() => setCurrentView('mail')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${currentView === 'mail' ? 'text-blue-600' : 'text-neutral-400'}`}
          >
            <Mail className="w-5 h-5" />
            <span className="text-[10px] font-medium">Mail</span>
          </button>
          <button 
            onClick={() => setCurrentView('drive')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${currentView === 'drive' ? 'text-green-600' : 'text-neutral-400'}`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-[10px] font-medium">Drive</span>
          </button>
          <button 
            onClick={() => setCurrentView('calendar')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${currentView === 'calendar' ? 'text-purple-600' : 'text-neutral-400'}`}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[10px] font-medium">Agenda</span>
          </button>
          {/* Mobile Accounts Toggle */}
          <button 
            onClick={() => document.getElementById('mobile-accounts-drawer')?.classList.toggle('hidden')}
            className="flex flex-col items-center justify-center w-full h-full gap-1 text-neutral-400"
          >
            <Layers className="w-5 h-5" />
            <span className="text-[10px] font-medium">Accounts</span>
          </button>
        </div>

        {/* Mobile Accounts Drawer (Simple Overlay) */}
        <div id="mobile-accounts-drawer" className="hidden md:hidden absolute inset-0 z-50 bg-neutral-900/50 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-white rounded-t-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold">Active Accounts</h3>
              <button onClick={() => document.getElementById('mobile-accounts-drawer')?.classList.add('hidden')} className="text-sm font-medium text-neutral-500">Done</button>
            </div>
            <div className="space-y-3">
              {accounts.map(acc => {
                const isActive = activeAccountIds.has(acc.id);
                return (
                  <div key={acc.id} onClick={() => toggleAccountActive(acc.id)} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-100 bg-neutral-50 cursor-pointer">
                    <div className="shrink-0">
                      {isActive ? <CheckSquare size={18} className="text-blue-500" /> : <Square size={18} className="text-neutral-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm truncate font-medium ${isActive ? 'text-neutral-900' : 'text-neutral-500'}`}>{acc.email}</div>
                    </div>
                    {acc.photoURL && <img src={acc.photoURL} alt="" className={`w-6 h-6 rounded-full shrink-0 ${isActive ? 'opacity-100' : 'opacity-40'}`} />}
                  </div>
                );
              })}
            </div>
            <button 
              onClick={() => handleLogin(true)}
              disabled={isAddingAccount}
              className="mt-6 w-full py-3 bg-neutral-900 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isAddingAccount ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add Another Account
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
      {/* Upgrade Modal overlay over main dashboard */}
      <UpgradeModal 
        showUpgradeModal={showUpgradeModal} 
        setShowUpgradeModal={setShowUpgradeModal} 
        setCurrentView={setCurrentView} 
      />

    </div>
  );
}
