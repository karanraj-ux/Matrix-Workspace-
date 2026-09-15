import React, { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { AccountToken, GmailMessage } from '../types';
import { fetchAttachmentAndUpload } from '../services/googleService';

interface SaveAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountToken[];
  email: GmailMessage | null;
  attachment: { attachmentId: string; filename: string; mimeType: string; size: number } | null;
}

export const SaveAttachmentModal: React.FC<SaveAttachmentModalProps> = ({
  isOpen, onClose, accounts, email, attachment
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !email || !attachment) return null;

  const handleSave = async () => {
    if (!selectedAccountId) {
      setError('Please select a target account');
      return;
    }
    const sourceAccount = accounts.find(a => a.id === email.accountId);
    const targetAccount = accounts.find(a => a.id === selectedAccountId);
    if (!sourceAccount || !targetAccount) return;

    setIsSaving(true);
    setError(null);
    try {
      await fetchAttachmentAndUpload(
        sourceAccount.accessToken,
        targetAccount.accessToken,
        email.id,
        attachment.attachmentId,
        attachment.filename,
        attachment.mimeType
      );
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (e) {
      console.error(e);
      setError('Failed to transfer attachment directly to Drive.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-white/50 p-4">
      <div className="bg-[#0a0a0a] rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Save to Drive</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-400">
            <X size={20} />
          </button>
        </div>

        {success ? (
          <div className="bg-green-500/10 text-green-700 p-4 rounded-lg font-medium text-center">
            Successfully streamed to Drive!
          </div>
        ) : (
          <>
            <div className="bg-[#111111] p-3 rounded-lg mb-6 text-sm">
              <div className="font-medium text-neutral-200">{attachment.filename}</div>
              <div className="text-neutral-500 mt-1">{(attachment.size / 1024).toFixed(1)} KB</div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-300 mb-2">Target Drive Account</label>
              <select 
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-neutral-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>Select an account...</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.email}</option>
                ))}
              </select>
            </div>

            {error && <div className="text-red-500 text-sm font-medium mb-4">{error}</div>}

            <button
              onClick={handleSave}
              disabled={isSaving || !selectedAccountId}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {isSaving ? 'Streaming to Drive...' : 'Save to Drive'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
