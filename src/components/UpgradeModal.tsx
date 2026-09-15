import React from 'react';
import { Layers } from 'lucide-react';

interface UpgradeModalProps {
  showUpgradeModal: boolean;
  setShowUpgradeModal: (show: boolean) => void;
  setCurrentView: (view: 'dashboard' | 'mail' | 'drive' | 'settings' | 'automation') => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  showUpgradeModal,
  setShowUpgradeModal,
  setCurrentView
}) => {
  if (!showUpgradeModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm">
      <div className="bg-[#0a0a0a] rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95">
        <div className="w-12 h-12 bg-white text-white rounded-xl flex items-center justify-center mb-6">
          <Layers className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">Limit Reached</h2>
        <p className="text-neutral-500 mb-6 leading-relaxed">
          The free beta tier is limited to 2 connected Google Accounts to conserve shared API quotas. To add unlimited accounts, upgrade to Enterprise BYOK mode.
        </p>
        <div className="space-y-3">
          <button 
            onClick={() => {
              setShowUpgradeModal(false);
              setCurrentView('settings');
            }}
            className="w-full py-3 px-4 bg-white text-white font-bold rounded-xl hover:bg-neutral-800 transition-colors"
          >
            Configure BYOK
          </button>
          <button 
            onClick={() => setShowUpgradeModal(false)}
            className="w-full py-3 px-4 bg-white/5 text-neutral-400 font-bold rounded-xl hover:bg-white/20 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
