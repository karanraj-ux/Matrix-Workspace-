import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  AlertCircle,
  RefreshCw,
  Mail,
  FileText,
  ArrowRight,
  HardDrive,
  Zap,
  CheckCircle2,
  Clock,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { get } from 'idb-keyval';
import { fetchAccountQuota } from '../services/multiCloudAdapter';
import { AccountToken, GmailMessage, DriveFile } from '../types';
import { AutomationLog, AutomationRule } from '../types/automation';

import { StorageQuotaInfo } from '../types';

interface DashboardViewProps {
  accounts: AccountToken[];
  filteredEmails: GmailMessage[];
  filteredFiles: DriveFile[];
  handleLogin: (forceSelect?: boolean) => void;
  setCurrentView: (view: 'dashboard' | 'mail' | 'drive' | 'settings' | 'automation') => void;
  openEmail: (email: GmailMessage) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  accounts,
  filteredEmails,
  filteredFiles,
  handleLogin,
  setCurrentView,
  openEmail,
}) => {
  const expiredAccounts = accounts.filter(acc => acc.isExpired);
  const activeAccounts = accounts.filter(acc => !acc.isExpired);

  const [automationLogs, setAutomationLogs] = useState<AutomationLog[]>([]);
  const [activeRulesCount, setActiveRulesCount] = useState<number>(0);

  useEffect(() => {
    get<AutomationLog[]>('matrix_automation_logs').then(logs => {
      if (logs) setAutomationLogs(logs.slice(0, 3));
    });
    get<AutomationRule[]>('matrix_automation_rules').then(rules => {
      if (rules) setActiveRulesCount(rules.filter(r => r.isActive).length);
    });
  }, []);

  const latestEmails = filteredEmails.slice(0, 3);
  const latestFiles = filteredFiles.slice(0, 3);

  
  const [accountQuotas, setAccountQuotas] = useState<{ [id: string]: StorageQuotaInfo }>({});
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);

  useEffect(() => {
    const activeAccounts = accounts.filter(a => !a.isExpired);
    if (activeAccounts.length === 0) return;

    const loadQuotas = async () => {
      setIsLoadingQuota(true);
      const newQuotas: { [id: string]: StorageQuotaInfo } = {};
      await Promise.all(
        activeAccounts.map(async (acc) => {
          try {
            const q = await fetchAccountQuota(acc);
            newQuotas[acc.id] = q;
          } catch (e) {
            console.warn(`Failed to fetch quota for ${acc.email}`, e);
          }
        })
      );
      setAccountQuotas(newQuotas);
      setIsLoadingQuota(false);
    };
    loadQuotas();
  }, [accounts]);

  const quotaList = Object.values(accountQuotas) as StorageQuotaInfo[];
  const totalPooledBytes = quotaList.reduce((acc, q) => acc + (q.totalBytes || 0), 0);
  const totalVirtualStorageGb = totalPooledBytes > 0 ? Math.round(totalPooledBytes / (1024 * 1024 * 1024)) : activeAccounts.length * 15;


  return (
    <div className="flex-1 h-full bg-[#F8FAFC] text-slate-800 flex flex-col font-sans overflow-y-auto">
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200/70 flex items-center justify-center shrink-0 shadow-xs">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight leading-tight">
                Workspace Command Deck
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Unified aggregation across {accounts.length} Google account{accounts.length !== 1 ? 's' : ''} with client-side zero-server privacy.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentView('automation')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-200 transition-colors shadow-xs cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-600" />
              <span>Mail Automation</span>
            </button>

            <button
              onClick={() => setCurrentView('drive')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold border border-emerald-200 transition-colors shadow-xs cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
              <span>Virtual Drive</span>
            </button>
          </div>
        </div>

        {/* Quick Executive Stats Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Connected Profiles
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">{accounts.length}</span>
              <span className="text-[11px] font-medium text-emerald-600">
                {activeAccounts.length} Active
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Pooled Storage
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">{totalVirtualStorageGb} GB</span>
              <span className="text-[11px] font-medium text-emerald-600">RAID Array</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Unified Mail
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">{filteredEmails.length}</span>
              <span className="text-[11px] font-medium text-blue-600">Messages</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Automations Active
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">{activeRulesCount}</span>
              <span className="text-[11px] font-medium text-amber-600">Rules</span>
            </div>
          </div>
        </div>

        {/* Expired Accounts Warning */}
        {expiredAccounts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start md:items-center gap-3.5">
              <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-900">Action Required: Session Expired</h3>
                <p className="text-xs text-red-700 mt-0.5">
                  OAuth tokens expired for the following profiles. Reconnect to resume synchronization:
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {expiredAccounts.map(acc => (
                    <span
                      key={acc.id}
                      className="text-[11px] font-medium text-red-800 bg-white/70 px-2.5 py-1 rounded-md border border-red-200"
                    >
                      {acc.email}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleLogin(true)}
              className="w-full md:w-auto px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reconnect
            </button>
          </div>
        )}

        {/* Zero State */}
        {accounts.length === 0 && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-100">
              <LayoutDashboard className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Welcome to Matrix Workspace</h2>
            <p className="text-xs text-slate-500 mb-6 max-w-md mx-auto">
              Link your Google accounts to unlock unified mailbox aggregation, virtual RAID-5 storage pooling, and cross-account mail automation.
            </p>
            <button
              onClick={() => handleLogin(true)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              Link Your First Account
            </button>
          </div>
        )}

        {/* Bento Grid */}
        {accounts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Mail Bento Widget */}
            <div className="bg-white border border-slate-200/90 rounded-2xl flex flex-col shadow-xs hover:shadow-sm transition-shadow h-[380px]">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                    <Mail className="w-4 h-4" />
                  </span>
                  <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                    Recent Messages
                  </h3>
                </div>
                <button
                  onClick={() => setCurrentView('mail')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {latestEmails.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No recent emails found
                  </div>
                ) : (
                  latestEmails.map(email => (
                    <div
                      key={email.id}
                      onClick={() => {
                        openEmail(email);
                        setCurrentView('mail');
                      }}
                      className="p-3 bg-slate-50/70 hover:bg-slate-100/80 rounded-xl border border-slate-200/70 cursor-pointer transition-colors"
                    >
                      <div className="text-[10px] text-slate-400 mb-0.5 flex items-center justify-between">
                        <span className="truncate max-w-[150px] font-medium text-slate-500">
                          {email.accountEmail}
                        </span>
                        <span>{new Date(email.timestamp).toLocaleDateString()}</span>
                      </div>
                      <div className="font-bold text-xs text-slate-900 truncate mb-0.5">
                        {email.subject}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{email.from}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Virtual Drive Bento Widget */}
            <div className="bg-white border border-slate-200/90 rounded-2xl flex flex-col shadow-xs hover:shadow-sm transition-shadow h-[380px]">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                    <HardDrive className="w-4 h-4" />
                  </span>
                  <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                    Virtual Drive & Files
                  </h3>
                </div>
                <button
                  onClick={() => setCurrentView('drive')}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {latestFiles.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No recent files
                  </div>
                ) : (
                  latestFiles.map(file => (
                    <div
                      key={file.id}
                      className="p-3 bg-slate-50/70 hover:bg-slate-100/80 rounded-xl border border-slate-200/70 flex items-start gap-2.5 transition-colors"
                    >
                      {file.iconLink ? (
                        <img src={file.iconLink} alt="" className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs text-slate-900 line-clamp-1 mb-0.5">
                          {file.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{file.accountEmail}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Mail Automation Bento Widget */}
            <div className="bg-white border border-slate-200/90 rounded-2xl flex flex-col shadow-xs hover:shadow-sm transition-shadow h-[380px]">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                    <Zap className="w-4 h-4" />
                  </span>
                  <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                    Mail Automation Activity
                  </h3>
                </div>
                <button
                  onClick={() => setCurrentView('automation')}
                  className="text-xs font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  Manage <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {automationLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 space-y-2">
                    <ShieldCheck className="w-8 h-8 text-slate-300" />
                    <p className="text-xs">Zero-server automation daemon is active</p>
                    <span className="text-[10px] text-slate-400">
                      Incoming emails matching your rules will auto-transfer or archive
                    </span>
                  </div>
                ) : (
                  automationLogs.map(log => (
                    <div
                      key={log.id}
                      className="p-3 bg-amber-50/40 rounded-xl border border-amber-100 flex items-start gap-2.5 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {log.ruleName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">
                          {log.actionTaken}
                        </div>
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
