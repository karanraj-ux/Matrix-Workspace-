import React from 'react';
import { Mail, MailOpen, Archive, CheckSquare, Reply, X, Loader2 } from 'lucide-react';
import { GmailMessage } from '../types';

interface MailViewProps {
  activeAccountIds: Set<string>;
  isLoadingStreams: boolean;
  filteredEmails: GmailMessage[];
  activeEmail: GmailMessage | null;
  openEmail: (email: GmailMessage) => void;
  setActiveEmail: (email: GmailMessage | null) => void;
  executeEmailAction: (action: 'read' | 'archive') => void;
  isEmailLoading: boolean;
  emailHtml: string;
}

export const MailView: React.FC<MailViewProps> = ({
  activeAccountIds,
  isLoadingStreams,
  filteredEmails,
  activeEmail,
  openEmail,
  setActiveEmail,
  executeEmailAction,
  isEmailLoading,
  emailHtml
}) => {
  return (
    <div className="absolute inset-0 bg-white flex">
      {/* Mail List (Left on Desktop) */}
      <div className={`flex flex-col border-r border-neutral-200 bg-neutral-50/50 ${activeEmail ? 'hidden md:flex md:w-[350px] lg:w-[400px] shrink-0' : 'w-full flex-1'}`}>
        <div className="h-14 border-b border-neutral-100 flex items-center justify-between px-4 shrink-0 bg-white">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold">Unread Inbox</h2>
          </div>
          {isLoadingStreams && <Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeAccountIds.size === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-400 text-center px-4">
              <p className="text-sm">Select an account in sidebar</p>
            </div>
          ) : filteredEmails.length === 0 && !isLoadingStreams ? (
            <div className="text-sm text-neutral-400 text-center py-8">Inbox Zero!</div>
          ) : (
            filteredEmails.map((email) => {
              const mailDate = new Date(email.date || email.timestamp || Date.now());
              const timeDisplay = mailDate.toDateString() === new Date().toDateString() 
                ? mailDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : mailDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

              const isActive = activeEmail?.id === email.id;

              return (
                <div key={`${email.accountId}-${email.id}`} 
                     onClick={() => openEmail(email)}
                     className={`p-3 rounded-xl border-y border-r border-l-4 shadow-sm transition-all cursor-pointer 
                       ${isActive ? 'bg-blue-50 border-l-blue-600 border-y-blue-200 border-r-blue-200' : 'bg-white border-l-blue-400 border-neutral-200 hover:shadow-md'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-medium text-neutral-500 truncate" title={email.accountEmail}>{email.accountEmail}</span>
                    </div>
                    <div className="text-[10px] font-semibold text-neutral-400 bg-neutral-100/80 px-1.5 py-0.5 rounded shrink-0">
                      {timeDisplay}
                    </div>
                  </div>
                  <div className={`font-bold text-sm truncate mb-1 ${isActive ? 'text-blue-900' : 'text-neutral-900'}`}>{email.subject}</div>
                  <div className="text-xs text-neutral-600 truncate font-medium mb-1">{email.from}</div>
                  <div className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">{email.snippet}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
      
      {/* Mail Reader (Right on Desktop, Full on Mobile) */}
      {activeEmail ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white absolute md:static inset-0 z-50">
          {/* Reader Header */}
          <div className="h-20 border-b border-neutral-100 flex flex-col justify-center px-6 shrink-0 bg-white">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-neutral-900 truncate pr-4">{activeEmail.subject}</h2>
                <div className="flex items-center gap-2 mt-1 text-sm text-neutral-500">
                  <span className="font-medium text-neutral-700">{activeEmail.from}</span>
                  <span>•</span>
                  <span className="truncate">{activeEmail.accountEmail}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => executeEmailAction('archive')} className="p-2 hover:bg-neutral-100 text-neutral-600 rounded-lg transition-colors flex items-center gap-2" title="Archive">
                  <Archive size={18} /> <span className="hidden lg:inline text-sm font-medium">Archive</span>
                </button>
                <button onClick={() => executeEmailAction('read')} className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors flex items-center gap-2" title="Mark Read">
                  <CheckSquare size={18} /> <span className="hidden lg:inline text-sm font-medium">Mark Read</span>
                </button>
                <div className="w-px h-6 bg-neutral-200 mx-1"></div>
                <button onClick={() => window.open(`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(activeEmail.accountEmail)}#inbox/${activeEmail.id}`, '_blank')} className="p-2 hover:bg-neutral-100 text-neutral-600 rounded-lg transition-colors" title="Reply in Gmail">
                  <Reply size={18} />
                </button>
                <button onClick={() => setActiveEmail(null)} className="p-2 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 rounded-lg transition-colors md:hidden ml-2">
                  <X size={20} />
                </button>
              </div>
            </div>
          </div>
          {/* Reader Body */}
          <div className="flex-1 relative overflow-hidden bg-white">
            {isEmailLoading ? (
               <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400">
                 <Loader2 className="w-8 h-8 animate-spin mb-4" />
                 <p className="text-sm font-medium">Decrypting Payload...</p>
               </div>
            ) : (
               <iframe 
                 title="Email Content"
                 srcDoc={emailHtml}
                 sandbox="allow-popups allow-same-origin"
                 className="w-full h-full border-none"
               />
            )}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-neutral-50 border-l border-neutral-100">
          <div className="text-center text-neutral-400">
            <MailOpen className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium text-neutral-500">No email selected</p>
            <p className="text-sm mt-1">Select an email to triage.</p>
          </div>
        </div>
      )}
    </div>
  );
};
