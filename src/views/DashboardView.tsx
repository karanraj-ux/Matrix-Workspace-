import React from 'react';
import { LayoutDashboard, AlertCircle, RefreshCw, Mail, Calendar as CalendarIcon, FileText, ArrowRight } from 'lucide-react';
import { AccountToken, GmailMessage, DriveFile, CalendarEvent } from '../types';

interface DashboardViewProps {
  accounts: AccountToken[];
  filteredEmails: GmailMessage[];
  filteredFiles: DriveFile[];
  filteredEvents: CalendarEvent[];
  handleLogin: (forceSelect?: boolean) => void;
  setCurrentView: (view: 'dashboard' | 'mail' | 'drive' | 'calendar' | 'settings') => void;
  openEmail: (email: GmailMessage) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  accounts,
  filteredEmails,
  filteredFiles,
  filteredEvents,
  handleLogin,
  setCurrentView,
  openEmail
}) => {
  const expiredAccounts = accounts.filter(acc => acc.isExpired);
  
  // Get upcoming 3 events
  const upcomingEvents = [...filteredEvents]
    .sort((a, b) => {
      const aDate = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
      const bDate = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
      return aDate - bDate;
    })
    .slice(0, 3);
    
  // Get latest 3 emails
  const latestEmails = filteredEmails.slice(0, 3);
  
  // Get latest 3 files
  const latestFiles = filteredFiles.slice(0, 3);

  return (
    <div className="absolute inset-0 bg-neutral-50 flex-col overflow-y-auto flex">
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6 md:space-y-8">
        
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div>
            <h2 className="text-xl md:text-3xl font-bold text-neutral-900 leading-tight">Unified Dashboard</h2>
            <p className="text-xs md:text-sm text-neutral-500">Overview of all your connected accounts and assets.</p>
          </div>
        </div>

        {/* Expired Accounts Prominent Warning */}
        {expiredAccounts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start md:items-center gap-4">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-900">Action Required: Sessions Expired</h3>
                <p className="text-sm text-red-700 mt-1">
                  {expiredAccounts.length} account{expiredAccounts.length > 1 ? 's have' : ' has'} expired credentials. 
                  You must reconnect to continue syncing data.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {expiredAccounts.map(acc => (
                    <div key={acc.id} className="flex items-center gap-2 bg-white/60 px-3 py-1.5 rounded-lg border border-red-200">
                      {acc.photoURL && <img src={acc.photoURL} alt="" className="w-4 h-4 rounded-full grayscale" />}
                      <span className="text-xs font-semibold text-red-800">{acc.email}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button 
              onClick={() => handleLogin(true)}
              className="w-full md:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Reconnect Accounts
            </button>
          </div>
        )}

        {/* Welcome State if no accounts selected */}
        {accounts.length === 0 && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-12 text-center shadow-sm">
            <LayoutDashboard className="w-16 h-16 text-neutral-200 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-neutral-900 mb-2">Welcome to Matrix</h3>
            <p className="text-neutral-500 mb-6 max-w-md mx-auto">Connect your Google Workspace accounts to unlock a unified dashboard for all your emails, files, and calendar events.</p>
            <button onClick={() => handleLogin(true)} className="px-6 py-3 bg-neutral-900 text-white font-bold rounded-xl shadow-md hover:bg-neutral-800 transition-colors inline-flex items-center gap-2">
              Add First Account
            </button>
          </div>
        )}

        {/* Bento Grid Layout */}
        {accounts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            
            {/* Mail Widget */}
            <div className="bg-white border border-neutral-200 rounded-2xl flex flex-col shadow-sm hover:shadow-md transition-shadow h-[400px]">
              <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-500" />
                  <h3 className="font-bold text-neutral-900">Recent Mail</h3>
                </div>
                <button onClick={() => setCurrentView('mail')} className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {latestEmails.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-neutral-400">No recent emails</div>
                ) : (
                  latestEmails.map(email => (
                    <div 
                      key={email.id} 
                      onClick={() => {
                        openEmail(email);
                        setCurrentView('mail');
                      }}
                      className="p-3 bg-neutral-50 rounded-xl border border-neutral-100 cursor-pointer hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                    >
                      <div className="text-xs text-neutral-500 mb-1 flex items-center gap-2 truncate">
                        <span className="truncate">{email.accountEmail}</span>
                      </div>
                      <div className="font-bold text-sm text-neutral-900 truncate mb-1">{email.subject}</div>
                      <div className="text-xs text-neutral-600 truncate">{email.from}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Calendar Widget */}
            <div className="bg-white border border-neutral-200 rounded-2xl flex flex-col shadow-sm hover:shadow-md transition-shadow h-[400px]">
              <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-purple-500" />
                  <h3 className="font-bold text-neutral-900">Upcoming Events</h3>
                </div>
                <button onClick={() => setCurrentView('calendar')} className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1">
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {upcomingEvents.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-neutral-400">No upcoming events</div>
                ) : (
                  upcomingEvents.map(event => {
                    const startDate = new Date(event.start?.dateTime || event.start?.date || Date.now());
                    return (
                      <div key={event.id} className="p-3 bg-purple-50/50 rounded-xl border border-purple-100">
                         <div className="text-xs font-bold text-purple-600 mb-1">
                          {startDate.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                         </div>
                         <div className="font-bold text-sm text-neutral-900 leading-snug">{event.summary || 'Busy'}</div>
                         <div className="text-xs text-neutral-500 mt-2 truncate">{event.accountEmail}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Drive Widget */}
            <div className="bg-white border border-neutral-200 rounded-2xl flex flex-col shadow-sm hover:shadow-md transition-shadow h-[400px]">
              <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-green-500" />
                  <h3 className="font-bold text-neutral-900">Recent Files</h3>
                </div>
                <button onClick={() => setCurrentView('drive')} className="text-xs font-semibold text-green-600 hover:text-green-700 flex items-center gap-1">
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {latestFiles.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-neutral-400">No recent files</div>
                ) : (
                  latestFiles.map(file => (
                    <div key={file.id} className="p-3 bg-green-50/50 rounded-xl border border-green-100 flex items-start gap-3">
                      {file.iconLink ? <img src={file.iconLink} alt="" className="w-5 h-5 shrink-0 mt-0.5" /> : <FileText className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-neutral-900 line-clamp-2 leading-snug mb-1">{file.name}</div>
                        <div className="text-xs text-neutral-500 truncate">{file.accountEmail}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
