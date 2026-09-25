import React, { useState } from 'react';
import { Mail, MailOpen, Archive, CheckSquare, Reply, X, Loader2, ArrowLeft, Zap } from 'lucide-react';
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
  onReply: (email: GmailMessage) => void;
  onSaveAttachmentToDrive: (
    email: GmailMessage,
    attachment: { attachmentId: string; filename: string; mimeType: string; size: number }
  ) => void;
  onAutomateSender?: (email: GmailMessage) => void;
  isAutomating?: boolean;
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
  emailHtml,
  onReply,
  onSaveAttachmentToDrive,
  onAutomateSender,
  isAutomating,
}) => {
  const [providerFilter, setProviderFilter] = useState<'all' | 'google' | 'onedrive'>('all');

  const gmailCount = filteredEmails.filter(e => !e.provider || e.provider === 'google').length;
  const outlookCount = filteredEmails.filter(e => e.provider === 'onedrive').length;

  const displayedEmails = filteredEmails.filter(email => {
    if (providerFilter === 'all') return true;
    if (providerFilter === 'onedrive') return email.provider === 'onedrive';
    return !email.provider || email.provider === 'google';
  });

  return (
    <div className="flex-1 h-full bg-[#F8FAFC] flex overflow-hidden font-sans">
      {/* Mail List Panel */}
      <div
        className={`flex flex-col border-r border-slate-200/90 bg-white ${
          activeEmail ? 'hidden md:flex md:w-[380px] lg:w-[420px] shrink-0' : 'w-full flex-1'
        }`}
      >
        <div className="border-b border-slate-100 p-3 shrink-0 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-blue-50 text-blue-600">
                <Mail className="w-4 h-4" />
              </span>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Unified Inbox
              </h2>
              <span className="text-[11px] font-semibold text-slate-500 px-1.5 py-0.5 rounded-full bg-slate-100">
                {displayedEmails.length}
              </span>
            </div>
            {isLoadingStreams && <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />}
          </div>

          {/* Provider Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
            <button
              onClick={() => setProviderFilter('all')}
              className={`flex-1 py-1 px-2 rounded-md font-semibold text-center transition-all cursor-pointer ${
                providerFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All ({filteredEmails.length})
            </button>
            <button
              onClick={() => setProviderFilter('google')}
              className={`flex-1 py-1 px-2 rounded-md font-semibold text-center transition-all cursor-pointer ${
                providerFilter === 'google'
                  ? 'bg-white text-rose-700 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Gmail ({gmailCount})
            </button>
            <button
              onClick={() => setProviderFilter('onedrive')}
              className={`flex-1 py-1 px-2 rounded-md font-semibold text-center transition-all cursor-pointer ${
                providerFilter === 'onedrive'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Outlook ({outlookCount})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activeAccountIds.size === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center px-6 py-12 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <Mail className="w-6 h-6 stroke-1" />
              </div>
              <p className="text-sm font-bold text-slate-800">No Account Selected</p>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Connect or select your Google Workspace or Microsoft Outlook account in the sidebar to stream messages.
              </p>
            </div>
          ) : displayedEmails.length === 0 && !isLoadingStreams ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center py-12 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <CheckSquare className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">Inbox Zero</p>
              <p className="text-xs text-slate-500">All messages processed or none matching filter</p>
            </div>
          ) : (
            displayedEmails.map(email => {
              const mailDate = new Date(email.date || email.timestamp || Date.now());
              const timeDisplay =
                mailDate.toDateString() === new Date().toDateString()
                  ? mailDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : mailDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

              const isActive = activeEmail?.id === email.id;
              const isOutlook = email.provider === 'onedrive';

              return (
                <div
                  key={`${email.accountId}-${email.id}`}
                  onClick={() => openEmail(email)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                    isActive
                      ? 'bg-blue-50/70 border-blue-200 border-l-4 border-l-blue-600 shadow-xs'
                      : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 ${
                          isOutlook
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {isOutlook ? 'Outlook' : 'Gmail'}
                      </span>
                      <span
                        className="text-[10px] font-semibold text-slate-500 truncate"
                        title={email.accountEmail}
                      >
                        {email.accountEmail}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-400 shrink-0">
                      {timeDisplay}
                    </span>
                  </div>
                  <div
                    className={`font-bold text-xs truncate mb-1 ${
                      isActive ? 'text-blue-900' : 'text-slate-900'
                    }`}
                  >
                    {email.subject}
                  </div>
                  <div className="text-[11px] text-slate-600 truncate font-medium mb-1">
                    {email.from}
                  </div>
                  <div className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {email.snippet}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Mail Reader Panel */}
      {activeEmail ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white absolute md:static inset-0 z-50">
          {/* Reader Header */}
          <div className="h-20 border-b border-slate-200/80 flex flex-col justify-center px-6 shrink-0 bg-white">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex items-center gap-3">
                <button
                  onClick={() => setActiveEmail(null)}
                  className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg md:hidden"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                  <h2 className="text-base md:text-lg font-bold text-slate-900 truncate">
                    {activeEmail.subject}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{activeEmail.from}</span>
                    <span>•</span>
                    <span className="truncate">{activeEmail.accountEmail}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">

                {onAutomateSender && (
                  <button
                    onClick={() => onAutomateSender(activeEmail)}
                    className="hidden sm:flex px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-semibold transition-colors items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Automate this sender"
                  >
                    <Zap size={14} />
                    <span>Automate</span>
                  </button>
                )}

                <button
                  disabled={isAutomating}
                  onClick={() => executeEmailAction('archive')}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Archive Message"
                >
                  <Archive size={14} />
                  <span className="hidden sm:inline">Archive</span>
                </button>
                <button
                  onClick={() => executeEmailAction('read')}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Mark as Read"
                >
                  <CheckSquare size={14} />
                  <span className="hidden sm:inline">Mark Read</span>
                </button>
                <button
                  onClick={() => onReply(activeEmail)}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-blue-200 flex items-center gap-1.5 shadow-2xs"
                  title="Reply"
                >
                  <Reply size={14} /> <span>Reply</span>
                </button>
              </div>
            </div>
          </div>

          {/* Attachments Strip */}
          {activeEmail.attachments && activeEmail.attachments.length > 0 && !isEmailLoading && (
            <div className="bg-slate-50 border-b border-slate-200/80 px-6 py-2.5 flex flex-wrap gap-2.5">
              {activeEmail.attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center bg-white border border-slate-200/90 rounded-xl p-2 gap-3 shadow-2xs max-w-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">{att.filename}</div>
                    <div className="text-[10px] text-slate-400">{(att.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <button
                    onClick={() => onSaveAttachmentToDrive(activeEmail, att)}
                    className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    Save to Drive
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Reader Body / Decrypted Payload */}
          <div className="flex-1 relative overflow-hidden bg-white">
            {isEmailLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-white">
                <Loader2 className="w-7 h-7 animate-spin mb-3 text-blue-600" />
                <p className="text-xs font-semibold text-slate-700">Loading Message Content...</p>
              </div>
            ) : (
              <iframe
                title="Email Content"
                srcDoc={emailHtml}
                sandbox="allow-popups allow-same-origin"
                className="w-full h-full border-none bg-white"
              />
            )}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-[#F8FAFC]">
          <div className="text-center text-slate-400 max-w-sm px-6">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 border border-slate-200">
              <MailOpen className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-800">No message selected</p>
            <p className="text-xs text-slate-500 mt-1">
              Select an email from the inbox list to read, triage, or reply.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
