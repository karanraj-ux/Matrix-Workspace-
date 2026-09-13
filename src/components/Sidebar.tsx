import React from 'react';
import { Layers, Mail, FileText, Calendar, CheckSquare, Square, AlertCircle, Plus, Loader2, ExternalLink, LogOut, LayoutDashboard } from 'lucide-react';
import { AccountToken } from '../types';

interface SidebarProps {
  currentView: 'dashboard' | 'mail' | 'drive' | 'calendar' | 'settings';
  setCurrentView: (view: 'dashboard' | 'mail' | 'drive' | 'calendar' | 'settings') => void;
  accounts: AccountToken[];
  activeAccountIds: Set<string>;
  toggleAccountActive: (id: string) => void;
  handleLogin: (forceSelect?: boolean) => void;
  isAddingAccount: boolean;
  launchDeepWork: (urlTemplate: string, accountId: string) => void;
  handleLogoutAll: () => void;
  isMobileMenuOpen?: boolean;
  closeMobileMenu?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setCurrentView,
  accounts,
  activeAccountIds,
  toggleAccountActive,
  handleLogin,
  isAddingAccount,
  launchDeepWork,
  handleLogoutAll,
  isMobileMenuOpen = false,
  closeMobileMenu = () => {}
}) => {
  return (
    <>
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeMobileMenu}
        />
      )}
      <div className={`${isMobileMenuOpen ? 'fixed inset-y-0 left-0 z-50 flex shadow-2xl' : 'hidden'} md:relative md:flex w-64 bg-neutral-900 text-white flex-col shrink-0`}>
      <div className="h-16 flex items-center justify-between px-6 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-blue-400" />
          <span className="font-bold tracking-wide text-sm">MATRIX</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-8">
        
        {/* Main Navigation */}
        <div className="px-4 space-y-1">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${currentView === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-sm font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => setCurrentView('mail')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${currentView === 'mail' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
          >
            <Mail className="w-4 h-4" />
            <span className="text-sm font-medium">Mail</span>
          </button>
          <button 
            onClick={() => setCurrentView('drive')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${currentView === 'drive' ? 'bg-green-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
          >
            <FileText className="w-4 h-4" />
            <span className="text-sm font-medium">Drive</span>
          </button>
          <button 
            onClick={() => setCurrentView('calendar')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${currentView === 'calendar' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
          >
            <Calendar className="w-4 h-4" />
            <span className="text-sm font-medium">Calendar</span>
          </button>
          <button 
            onClick={() => setCurrentView('settings')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${currentView === 'settings' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
          >
            <Layers className="w-4 h-4" />
            <span className="text-sm font-medium">Security</span>
          </button>
        </div>

        {/* Accounts Panel */}
        <div className="px-6">
          <h2 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-4">Accounts Panel</h2>
          <div className="space-y-2">
            {accounts.map(acc => {
              const isActive = activeAccountIds.has(acc.id);
              return (
                <div key={acc.id} className="flex items-start gap-3 group">
                  <button onClick={() => toggleAccountActive(acc.id)} className="text-neutral-400 hover:text-white transition-colors mt-0.5 shrink-0">
                    {isActive ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
                  </button>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className={`text-sm truncate transition-colors flex items-center gap-2 ${isActive ? 'text-white' : 'text-neutral-400'} ${acc.isExpired ? 'opacity-50' : ''}`}>
                      {acc.email}
                      {acc.isExpired && <AlertCircle size={12} className="text-red-400 shrink-0" title="Session Expired" />}
                    </div>
                  </div>
                  {acc.photoURL && (
                    <img src={acc.photoURL} alt="" className={`w-5 h-5 rounded-full shrink-0 transition-opacity ${isActive ? 'opacity-100' : 'opacity-40'} ${acc.isExpired ? 'grayscale' : ''}`} />
                  )}
                </div>
              );
            })}
          </div>
          
          <button 
            onClick={() => handleLogin(true)}
            disabled={isAddingAccount}
            className="mt-6 w-full py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {isAddingAccount ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add Account
          </button>
        </div>

      </div>
      
      <div className="p-6 border-t border-neutral-800">
         <button onClick={handleLogoutAll} className="flex items-center gap-2 text-xs text-neutral-500 hover:text-white transition-colors">
           <LogOut size={14} /> Log out all accounts
         </button>
      </div>
    </div>
    </>
  );
};
