import React from 'react';
import { MailOpen, X, Loader2, Archive, CheckSquare, Reply } from 'lucide-react';
import { GmailMessage } from '../types';

interface EmailReaderProps {
  activeEmail: GmailMessage | null;
  setActiveEmail: (email: GmailMessage | null) => void;
  emailHtml: string;
  isEmailLoading: boolean;
  executeEmailAction: (action: 'archive' | 'read') => void;
}

export const EmailReader: React.FC<EmailReaderProps> = ({
  activeEmail,
  setActiveEmail,
  emailHtml,
  isEmailLoading,
  executeEmailAction
}) => {
  if (!activeEmail) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-sm flex flex-col justify-end md:justify-center items-center p-0 md:p-6 animate-in fade-in duration-200">
      <div className="w-full h-[90vh] md:h-[85vh] md:max-w-4xl bg-[#0a0a0a] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-full md:zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#111111] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-400 flex items-center justify-center shrink-0">
              <MailOpen size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-white truncate">{activeEmail.subject}</h3>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span className="truncate">{activeEmail.from}</span>
                <span>•</span>
                {/* Fallback to initials or icon if no photoURL provided */}
                {/* Note: App.tsx used activeEmail.accountPhoto which we didn't map in the strict types, we can use an img or skip if not explicitly present */}
                <span className="text-xs">{activeEmail.accountEmail}</span>
              </div>
            </div>
          </div>
          <button onClick={() => setActiveEmail(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-neutral-500 shrink-0 ml-2">
            <X size={20} />
          </button>
        </div>

        {/* Sandboxed Body */}
        <div className="flex-1 overflow-hidden relative bg-[#0a0a0a]">
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

        {/* Triage Actions */}
        <div className="p-4 bg-[#111111] border-t border-white/5 grid grid-cols-3 gap-2 shrink-0 pb-safe">
          <button 
            onClick={() => executeEmailAction('archive')}
            className="flex flex-col items-center justify-center gap-1 py-3 px-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-200 rounded-xl font-medium transition-colors"
          >
            <Archive size={18} />
            <span className="text-[10px] sm:text-xs">Archive</span>
          </button>
          <button 
            onClick={() => executeEmailAction('read')}
            className="flex flex-col items-center justify-center gap-1 py-3 px-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-xl font-medium transition-colors"
          >
            <CheckSquare size={18} />
            <span className="text-[10px] sm:text-xs">Mark Read</span>
          </button>
          <button 
            onClick={() => window.open(`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(activeEmail.accountEmail)}#inbox/${activeEmail.id}`, '_blank')}
            className="flex flex-col items-center justify-center gap-1 py-3 px-2 bg-white hover:bg-neutral-800 text-white rounded-xl font-medium transition-colors"
          >
            <Reply size={18} />
            <span className="text-[10px] sm:text-xs text-center leading-tight">Reply<br className="sm:hidden" /> Natively</span>
          </button>
        </div>

      </div>
    </div>
  );
};
