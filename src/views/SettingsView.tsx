import React from 'react';
import { Layers } from 'lucide-react';

interface SettingsViewProps {
  isByokMode: boolean;
  setIsByokMode: (val: boolean) => void;
  customClientId: string;
  setCustomClientId: (val: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  isByokMode,
  setIsByokMode,
  customClientId,
  setCustomClientId
}) => {
  return (
    <div className="absolute inset-0 bg-neutral-50 flex-col overflow-y-auto flex">
      <div className="p-8 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-neutral-200 text-neutral-700 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 leading-tight">Security & API Access</h2>
            <p className="text-sm text-neutral-500">Manage how Matrix connects to your Google accounts.</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
          <div className="p-6 border-b border-neutral-100">
            <h3 className="text-lg font-bold text-neutral-900 mb-1">Bring Your Own Key (BYOK) Mode</h3>
            <p className="text-sm text-neutral-500 leading-relaxed">
              By default, Matrix uses a shared Google Cloud project that is restricted to early access testers. 
              To unlock unlimited access and ensure 100% data privacy, provide your own Google OAuth Client ID. 
              Your Client ID is stored locally on your device and never sent to our servers.
            </p>
          </div>
          
          <div className="p-6 bg-neutral-50/50 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-neutral-900 text-sm">Enable Enterprise BYOK</div>
                <div className="text-xs text-neutral-500 mt-0.5">Bypass shared quota limits</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={isByokMode} onChange={(e) => setIsByokMode(e.target.checked)} />
                <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
              </label>
            </div>

            {isByokMode && (
              <div className="pt-4 border-t border-neutral-200 animate-in fade-in slide-in-from-top-2">
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Google OAuth Client ID</label>
                <input 
                  type="text" 
                  value={customClientId}
                  onChange={(e) => setCustomClientId(e.target.value)}
                  placeholder="e.g. 123456789-abcde.apps.googleusercontent.com"
                  className="w-full px-4 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-black focus:border-black transition-all outline-none font-mono"
                />
                <div className="mt-3 text-xs text-neutral-500">
                  Required Scopes: <code className="bg-neutral-100 px-1 py-0.5 rounded text-[10px]">drive</code> <code className="bg-neutral-100 px-1 py-0.5 rounded text-[10px]">gmail.readonly</code> <code className="bg-neutral-100 px-1 py-0.5 rounded text-[10px]">calendar.readonly</code>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-center text-xs text-neutral-400 mt-12">
          All data transfers occur strictly over secure client-side browser memory.
        </div>
      </div>
    </div>
  );
};
