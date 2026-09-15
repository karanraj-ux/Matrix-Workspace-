import React, { useState } from 'react';
import { Shield, Key, Lock, Cloud, Plus, CheckCircle2, Trash2 } from 'lucide-react';
import { AccountToken } from '../types';

interface SettingsViewProps {
  isByokMode: boolean;
  setIsByokMode: (val: boolean) => void;
  customClientId: string;
  setCustomClientId: (val: string) => void;
  handleLogin?: (forceSelect?: boolean) => void;
  accounts: AccountToken[];
  onAddMultiCloudAccount: (account: AccountToken) => void;
  onRemoveAccount: (id: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  isByokMode,
  setIsByokMode,
  customClientId,
  setCustomClientId,
  handleLogin,
  accounts,
  onAddMultiCloudAccount,
  onRemoveAccount,
}) => {
  // Manual token entry modal states for OneDrive and Dropbox
  const [providerModal, setProviderModal] = useState<'onedrive' | 'dropbox' | null>(null);
  const [tokenEmail, setTokenEmail] = useState('');
  const [tokenKey, setTokenKey] = useState('');

  const handleSaveMultiCloudToken = () => {
    if (!tokenEmail || !tokenKey || !providerModal) return;

    const newAcc: AccountToken = {
      id: `${providerModal}_${Date.now()}`,
      email: tokenEmail,
      name: `${providerModal.toUpperCase()} Account`,
      photoURL: null,
      accessToken: tokenKey.trim(),
      provider: providerModal,
    };

    onAddMultiCloudAccount(newAcc);
    setProviderModal(null);
    setTokenEmail('');
    setTokenKey('');
  };

  return (
    <div className="flex-1 h-full bg-[#F8FAFC] text-slate-800 flex flex-col font-sans overflow-y-auto">
      <div className="p-6 md:p-8 max-w-3xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 border border-slate-200/80 flex items-center justify-center shrink-0 shadow-xs">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight leading-tight">
              Multi-Cloud & BYOK Security
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage Google Drive, Microsoft OneDrive, Dropbox accounts, client-side encryption keys, and OAuth.
            </p>
          </div>
        </div>

        {/* Multi-Cloud Provider Accounts Manager */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Multi-Cloud Provider Array</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setProviderModal('onedrive')}
                className="px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus size={12} /> Connect OneDrive
              </button>
              <button
                onClick={() => setProviderModal('dropbox')}
                className="px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus size={12} /> Connect Dropbox
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            By connecting Microsoft OneDrive (5 GB free) and Dropbox (2 GB free) alongside Google Drive (15 GB free),
            your virtual RAID-5 hard drive achieves <strong>multi-cloud vendor immunity</strong>. Even if Google bans
            an account, files can be recovered via erasure coding.
          </p>

          <div className="space-y-2 pt-2">
            {accounts.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-400">No accounts linked yet.</div>
            ) : (
              accounts.map(acc => {
                const provider = acc.provider || 'google';
                return (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 bg-slate-50/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-xs">
                        {provider === 'onedrive' ? 'MS' : provider === 'dropbox' ? 'DB' : 'GD'}
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-slate-800">{acc.email}</div>
                        <div className="text-[11px] text-slate-400 uppercase tracking-wider font-bold">
                          {provider}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveAccount(acc.id)}
                      className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* BYOK Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Key className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Bring Your Own Key (BYOK) - Google OAuth</h2>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Matrix operates purely in your browser runtime without backend database servers. By default, it runs with
              the credentials configured in your project. You can provide your own custom Google OAuth Client ID to
              connect unlimited organizational accounts and ensure total sovereignty.
            </p>
          </div>

          <div className="p-6 bg-slate-50/60 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900 text-xs">Custom Google Client ID Mode</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Bypass shared origin quotas with your custom Google Cloud Console project
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isByokMode}
                  onChange={e => setIsByokMode(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {isByokMode && (
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Google OAuth Client ID</label>
                  <input
                    type="text"
                    value={customClientId}
                    onChange={e => setCustomClientId(e.target.value)}
                    placeholder="e.g. 123456789-abcde.apps.googleusercontent.com"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-mono"
                  />
                </div>

                <div className="text-[11px] text-slate-500 flex items-center flex-wrap gap-1.5">
                  <span>Required Scopes:</span>
                  <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">drive</code>
                  <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">gmail.send</code>
                  <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">gmail.modify</code>
                </div>

                {handleLogin && customClientId && customClientId.trim() !== '' && (
                  <button
                    onClick={() => handleLogin(true)}
                    className="mt-4 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    Save & Authenticate Custom Profile
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Zero Server Guarantee */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex items-start gap-3.5">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 mb-0.5">Zero-Server Architecture Guarantee</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Tokens and encryption keys are stored exclusively in your browser's local IndexedDB container (
              <code className="text-slate-700">idb-keyval</code>). No telemetry, chunk manifests, or email bodies are
              ever transmitted to third-party databases.
            </p>
          </div>
        </div>
      </div>

      {/* MODAL TO ADD ONEDRIVE / DROPBOX TOKEN */}
      {providerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Connect {providerModal === 'onedrive' ? 'Microsoft OneDrive' : 'Dropbox'} Token
              </h3>
              <button
                onClick={() => setProviderModal(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Enter your {providerModal === 'onedrive' ? 'Microsoft Graph API access token' : 'Dropbox API access token'} to
              pool its quota into your RAID-5 distributed storage array.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Account Label / Email</label>
                <input
                  type="text"
                  value={tokenEmail}
                  onChange={e => setTokenEmail(e.target.value)}
                  placeholder={`user@${providerModal === 'onedrive' ? 'outlook.com' : 'example.com'}`}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Access Token / Bearer Key</label>
                <textarea
                  value={tokenKey}
                  onChange={e => setTokenKey(e.target.value)}
                  rows={3}
                  placeholder="Paste OAuth access token..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setProviderModal(null)}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMultiCloudToken}
                disabled={!tokenEmail || !tokenKey}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
              >
                Save Provider Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
