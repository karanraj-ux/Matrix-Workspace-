import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, Paperclip } from 'lucide-react';
import { AccountToken, GmailMessage, DriveFile } from '../types';
import { createMimeMessage } from '../utils/emailUtils';
import { sendEmail, uploadFileToDriveResumable } from '../services/googleService';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountToken[];
  replyToEmail: GmailMessage | null;
  initialDriveFile?: DriveFile | null;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose, accounts, replyToEmail, initialDriveFile }) => {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (isOpen) {
      if (replyToEmail) {
        // Extract plain email from 'from' string (e.g., "Name <email@example.com>" -> "email@example.com")
        const fromMatch = replyToEmail.from.match(/<(.+)>/);
        const toEmail = fromMatch ? fromMatch[1] : replyToEmail.from;
        
        setTo(toEmail);
        setSubject(replyToEmail.subject.toLowerCase().startsWith('re:') ? replyToEmail.subject : `Re: ${replyToEmail.subject}`);
        setSelectedAccountId(replyToEmail.accountId);
        
        // Include some quoted text
        setBody(`<br><br><div class="gmail_quote" style="border-left: 1px solid #ccc; padding-left: 1ex; margin-top: 10px;">On ${new Date(replyToEmail.date || Date.now()).toLocaleString()} ${replyToEmail.from} wrote:<br><blockquote class="gmail_quote" style="margin: 0px 0px 0px 0.8ex; border-left: 1px solid rgb(204, 204, 204); padding-left: 1ex;">${replyToEmail.snippet}...</blockquote></div>`);
      } else {
        setTo('');
        setSubject('');
        
        let initialBody = '';
        if (initialDriveFile) {
          initialBody = `
<br><br>
<div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; display: flex; align-items: center; gap: 12px; max-width: 400px; font-family: sans-serif; background: #fafafa;">
  <div style="background: #eff6ff; padding: 8px; border-radius: 6px;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
    </svg>
  </div>
  <div style="flex-1; min-width: 0;">
    <div style="font-weight: 600; font-size: 14px; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${initialDriveFile.name}</div>
    <div style="font-size: 12px; color: #6b7280;">Shared via Drive</div>
  </div>
  <a href="${initialDriveFile.webViewLink}" target="_blank" style="margin-left: auto; padding: 6px 12px; background: #3b82f6; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: 600; display: inline-block;">Download</a>
</div>
<br>`;
        }
        
        setBody(initialBody);
        
        if (accounts.length > 0) {
          setSelectedAccountId(accounts[0].id);
        }
      }
      setError(null);
    }
  }, [isOpen, replyToEmail, accounts, initialDriveFile]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedAccountId) {
      setError('Please select an account first.');
      return;
    }

    const account = accounts.find(a => a.id === selectedAccountId);
    if (!account) return;

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const uploadedFile = await uploadFileToDriveResumable(
        account.accessToken,
        file,
        (progress) => setUploadProgress(progress)
      );

      const htmlCard = `
<br><br>
<div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; display: flex; align-items: center; gap: 12px; max-width: 400px; font-family: sans-serif; background: #fafafa;">
  <div style="background: #eff6ff; padding: 8px; border-radius: 6px;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
    </svg>
  </div>
  <div style="flex-1; min-width: 0;">
    <div style="font-weight: 600; font-size: 14px; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${uploadedFile.name}</div>
    <div style="font-size: 12px; color: #6b7280;">${(uploadedFile.size / 1024 / 1024).toFixed(2)} MB • Shared via Drive</div>
  </div>
  <a href="${uploadedFile.webViewLink}" target="_blank" style="margin-left: auto; padding: 6px 12px; background: #3b82f6; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: 600; display: inline-block;">Download</a>
</div>
<br>`;

      setBody(prev => prev + htmlCard);
      setIsUploading(false);
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error(err);
      setError('Failed to stream file to Drive.');
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if (!to || !subject || !selectedAccountId) {
      setError('Please fill in all required fields');
      return;
    }

    setIsSending(true);
    setError(null);

    const account = accounts.find(a => a.id === selectedAccountId);
    if (!account) {
      setError('Selected account not found');
      setIsSending(false);
      return;
    }

    try {
      const mimeMessage = createMimeMessage({
        to,
        from: account.email || '',
        subject,
        body,
        inReplyTo: replyToEmail?.messageId,
        references: replyToEmail?.references
      });

      await sendEmail(account.accessToken, mimeMessage, replyToEmail?.threadId);
      
      setIsSending(false);
      onClose();
    } catch (e) {
      console.error(e);
      setError('Failed to send email');
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/50 p-4">
      <div className="bg-[#0a0a0a] rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-neutral-900 text-white px-4 py-3 flex items-center justify-between">
          <h2 className="font-medium text-sm">{replyToEmail ? 'Reply' : 'New Message'}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form Fields */}
        <div className="flex flex-col text-sm border-b border-white/10">
          <div className="flex items-center px-4 py-2 border-b border-white/5">
            <span className="text-neutral-500 w-16">From</span>
            <select 
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="flex-1 bg-transparent outline-none text-white font-medium"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.email}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center px-4 py-2 border-b border-white/5">
            <span className="text-neutral-500 w-16">To</span>
            <input 
              type="text" 
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 bg-transparent outline-none text-white" 
              placeholder="recipient@example.com"
            />
          </div>
          
          <div className="flex items-center px-4 py-2">
            <span className="text-neutral-500 w-16">Subject</span>
            <input 
              type="text" 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 bg-transparent outline-none text-white" 
              placeholder="Subject"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-red-50 text-red-600 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-[300px] flex flex-col relative">
          <div 
            className="flex-1 p-4 outline-none overflow-y-auto whitespace-pre-wrap font-sans text-sm text-neutral-200"
            contentEditable
            onInput={(e) => setBody(e.currentTarget.innerHTML)}
            dangerouslySetInnerHTML={{ __html: body }}
          />
          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-200">
              <div 
                className="h-full bg-blue-500/100 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[#111111] border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="text-neutral-500 hover:text-neutral-300 text-sm font-medium transition-colors"
            >
              Discard
            </button>
            <div className="w-px h-4 bg-neutral-300 mx-1"></div>
            
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isSending || !selectedAccountId}
              className="text-neutral-500 hover:text-blue-400 disabled:opacity-50 text-sm font-medium transition-colors flex items-center gap-1.5"
              title="Attach File (Auto-streams to Drive)"
            >
              <Paperclip size={16} />
              <span className="hidden sm:inline">Attach</span>
            </button>
            {isUploading && (
              <span className="text-xs text-blue-400 font-medium animate-pulse">
                Streaming to Drive {uploadProgress}%
              </span>
            )}
          </div>
          
          <button 
            onClick={handleSend}
            disabled={isSending || isUploading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Send
          </button>
        </div>
        
      </div>
    </div>
  );
};
