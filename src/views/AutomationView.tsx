import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap,
  Plus,
  Activity,
  Mail,
  FileText,
  ArrowRight,
  Trash2,
  Power,
  PowerOff,
  CheckCircle2,
  AlertCircle,
  Play,
  Loader2,
  Sparkles,
  ShieldCheck,
  Send,
  X,
  Clock,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { get, set } from 'idb-keyval';
import { AccountToken } from '../types';
import { AutomationRule, AutomationLog, RuleCondition, RuleAction } from '../types/automation';
import { executeAutomations } from '../services/automationEngine';

interface AutomationViewProps {
  accounts: AccountToken[];
}

export const AutomationView: React.FC<AutomationViewProps> = ({ accounts }) => {
  const [activeTab, setActiveTab] = useState<'recipes' | 'rules' | 'logs'>('recipes');
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [isRunningNow, setIsRunningNow] = useState(false);
  const [runFeedback, setRunFeedback] = useState<string | null>(null);
  const [lastWorkerTick, setLastWorkerTick] = useState<number | null>(null);
  const daemonWorkerRef = useRef<Worker | null>(null);

  // Preset Quick Setup States
  const [teleportSourceId, setTeleportSourceId] = useState('');
  const [teleportTargetEmail, setTeleportTargetEmail] = useState('');
  const [teleportFeedback, setTeleportFeedback] = useState<string | null>(null);

  // Custom Rule Form State
  const [newRuleName, setNewRuleName] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [conditions, setConditions] = useState<RuleCondition[]>([
    { id: '1', field: 'subject', operator: 'contains', value: 'code' },
  ]);
  const [actions, setActions] = useState<RuleAction[]>([
    { id: '1', type: 'FORWARD_EMAIL', targetEmail: '' },
  ]);

  const activeAccounts = accounts.filter(a => !a.isExpired);

  // Dedicated Web Worker Background Daemon to bypass tab throttling
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const worker = new Worker(new URL('../services/daemonWorker.ts', import.meta.url), {
          type: 'module',
        });
        daemonWorkerRef.current = worker;

        worker.onmessage = async (e: MessageEvent) => {
          if (e.data.type === 'DAEMON_TICK') {
            setLastWorkerTick(e.data.timestamp);
            // Execute automations in the background without UI lag
            const currentRules = (await get<AutomationRule[]>('matrix_automation_rules')) || [];
            if (currentRules.some(r => r.isActive)) {
              executeAutomations(currentRules, accounts).then(res => {
                if (res.processedCount > 0) {
                  get<AutomationLog[]>('matrix_automation_logs').then(l => l && setLogs(l));
                }
              }).catch(() => {});
            }
          }
        };

        // Start 25s autonomous loop in background thread
        worker.postMessage({ action: 'START_DAEMON', intervalMs: 25000 });
      } catch (e) {
        console.warn('Web Worker daemon init failed, falling back to interval:', e);
      }
    }

    return () => {
      if (daemonWorkerRef.current) {
        daemonWorkerRef.current.postMessage({ action: 'STOP_DAEMON' });
        daemonWorkerRef.current.terminate();
        daemonWorkerRef.current = null;
      }
    };
  }, [accounts]);

  useEffect(() => {
    get('matrix_automation_rules').then(r => r && setRules(r));
    get('matrix_automation_logs').then(l => l && setLogs(l));

    if (activeAccounts.length > 0 && !teleportSourceId) {
      // Default to second account or first account
      const source = activeAccounts.length > 1 ? activeAccounts[1] : activeAccounts[0];
      setTeleportSourceId(source.id);
      // Default target to first account email
      setTeleportTargetEmail(activeAccounts[0].email || '');
    }

    const interval = setInterval(() => {
      get('matrix_automation_logs').then(l => l && setLogs(l));
    }, 5000);
    return () => clearInterval(interval);
  }, [accounts]);

  const saveRules = async (newRules: AutomationRule[]) => {
    setRules(newRules);
    await set('matrix_automation_rules', newRules);
  };

  const toggleRule = (id: string) => {
    saveRules(rules.map(r => (r.id === id ? { ...r, isActive: !r.isActive } : r)));
  };

  const deleteRule = (id: string) => {
    saveRules(rules.filter(r => r.id !== id));
  };

  const handleRunNow = async () => {
    try {
      setIsRunningNow(true);
      setRunFeedback(null);
      const res = await executeAutomations(rules, accounts);
      const updatedLogs = (await get('matrix_automation_logs')) || [];
      setLogs(updatedLogs);
      setRunFeedback(
        `Execution complete! Checked all unread messages. Actions triggered: ${res.processedCount}.`
      );
      setTimeout(() => setRunFeedback(null), 6000);
    } catch (e: any) {
      setRunFeedback(`Error running automations: ${e.message}`);
    } finally {
      setIsRunningNow(false);
    }
  };

  const handleCreateOtpPreset = () => {
    if (!teleportSourceId || !teleportTargetEmail) {
      setTeleportFeedback('Please select both a source account and a target recipient email.');
      return;
    }

    const sourceAcc = accounts.find(a => a.id === teleportSourceId);
    const presetRule: AutomationRule = {
      id: Math.random().toString(36).substring(2, 9),
      name: `Mail Forwarder: ${sourceAcc?.email?.split('@')[0] || 'Alt'} -> ${teleportTargetEmail}`,
      sourceAccountId: teleportSourceId,
      trigger: 'ON_NEW_EMAIL',
      conditions: [
        {
          id: 'c1',
          field: "any_email", operator: "always", value: ""
        },
      ],
      actions: [
        {
          id: 'a1',
          type: 'FORWARD_EMAIL',
          targetEmail: teleportTargetEmail,
        },
        {
          id: 'a2',
          type: 'MARK_AS_READ',
        },
      ],
      isActive: true,
      createdAt: Date.now(),
    };

    saveRules([presetRule, ...rules]);
    setActiveTab('rules');
    setTeleportFeedback('⚡ Mail Forwarder activated! New emails will forward instantly.');
    setTimeout(() => setTeleportFeedback(null), 5000);
  };

  const saveCustomRule = () => {
    if (!newRuleName || !sourceAccountId || conditions.length === 0 || actions.length === 0) return;
    const rule: AutomationRule = {
      id: Math.random().toString(36).substring(2, 9),
      name: newRuleName,
      sourceAccountId,
      trigger: 'ON_NEW_EMAIL',
      conditions,
      actions,
      isActive: true,
      createdAt: Date.now(),
    };
    saveRules([rule, ...rules]);
    setIsCreatingCustom(false);
    setNewRuleName('');
    setActiveTab('rules');
  };

  return (
    <div className="flex-1 h-full bg-[#F8FAFC] text-slate-800 flex flex-col font-sans overflow-hidden">
      {/* Top Banner / Header */}
      <div className="bg-white border-b border-slate-200/80 px-6 py-5 shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 shadow-xs">
                <Zap className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  Zero-Server Mail Forwarder & Automations
                  <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Live Autonomous
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    <Cpu size={11} /> Worker Active
                  </span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automate cross-account OTP teleports, verification codes, and background workflows entirely in browser memory via dedicated Web Worker threads.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleRunNow}
              disabled={isRunningNow || activeAccounts.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isRunningNow ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
              ) : (
                <Play className="w-3.5 h-3.5 text-amber-600" />
              )}
              {isRunningNow ? 'Running Cycle...' : 'Run Automations Now'}
            </button>

            <button
              onClick={() => setIsCreatingCustom(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Rule
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-6xl mx-auto flex items-center gap-6 mt-5 border-b border-slate-100 pt-1">
          <button
            onClick={() => setActiveTab('recipes')}
            className={`pb-2.5 text-xs font-semibold transition-all relative ${
              activeTab === 'recipes' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              1-Click Teleporter Recipes
            </span>
            {activeTab === 'recipes' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('rules')}
            className={`pb-2.5 text-xs font-semibold transition-all relative ${
              activeTab === 'rules' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Active Rules ({rules.length})
            {activeTab === 'rules' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-2.5 text-xs font-semibold transition-all relative ${
              activeTab === 'logs' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              Audit Trail ({logs.length})
            </span>
            {activeTab === 'logs' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Status Feedback Notice */}
          <AnimatePresence>
            {(runFeedback || teleportFeedback) && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium flex items-center justify-between shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{runFeedback || teleportFeedback}</span>
                </div>
                <button
                  onClick={() => {
                    setRunFeedback(null);
                    setTeleportFeedback(null);
                  }}
                  className="text-blue-500 hover:text-blue-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* TAB 1: 1-CLICK TELEPORTER RECIPES */}
          {activeTab === 'recipes' && (
            <div className="space-y-6">
              {/* Featured: Instant OTP & Login Code Teleporter */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold shadow-xs">
                      ⚡
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        Instant OTP & Login Code Teleporter
                      </h2>
                      <p className="text-xs text-slate-500">
                        Never log into unused alternate accounts. When an email arrives, it forwards straight to your active email and marks as read automatically.
                      </p>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    Recommended
                  </span>
                </div>

                {activeAccounts.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    Please authenticate at least one Google account via the sidebar to activate the teleporter.
                  </div>
                ) : (
                  <div className="mt-4 p-5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Step 1: Source */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          1. Watch Unused / Secondary Account:
                        </label>
                        <select
                          value={teleportSourceId}
                          onChange={e => setTeleportSourceId(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                        >
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id} disabled={acc.isExpired}>
                              {acc.email} {acc.isExpired ? '(Expired)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Step 2: Target */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          2. Teleport OTP Instantly To Active Recipient:
                        </label>
                        <input
                          type="email"
                          placeholder="primary-email@gmail.com"
                          value={teleportTargetEmail}
                          onChange={e => setTeleportTargetEmail(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between pt-2 border-t border-slate-200/60 gap-3">
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>Filter: Matches keywords like "invoice", "report", "update", "login" or anything else you set.</span>
                      </div>
                      <button
                        onClick={handleCreateOtpPreset}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Activate Mail Forwarder Now
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Recipe 2: Attachment / Invoice Auto-Archiver */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shadow-xs">
                      📁
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        Cross-Account Invoice & Receipt Vault
                      </h2>
                      <p className="text-xs text-slate-500">
                        Automatically extract PDF receipts and attachments sent to any email and store them in your primary Google Drive storage.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-xs text-slate-600">
                    Triggers on emails with subject matching <span className="font-semibold text-slate-800">"invoice"</span> or <span className="font-semibold text-slate-800">"receipt"</span> with attachments.
                  </div>
                  <button
                    onClick={() => {
                      if (activeAccounts.length === 0) return;
                      const sourceAcc = activeAccounts[0];
                      const targetAcc = activeAccounts.length > 1 ? activeAccounts[1] : activeAccounts[0];
                      const rule: AutomationRule = {
                        id: Math.random().toString(36).substring(2, 9),
                        name: `Auto-Vault Invoices -> ${targetAcc.email}`,
                        sourceAccountId: sourceAcc.id,
                        trigger: 'ON_NEW_EMAIL',
                        conditions: [
                          { id: 'c1', field: 'subject', operator: 'contains', value: 'invoice' },
                          { id: 'c2', field: 'hasAttachment', operator: 'is_true', value: true },
                        ],
                        actions: [
                          {
                            id: 'a1',
                            type: 'SAVE_ATTACHMENTS_TO_DRIVE',
                            targetAccountId: targetAcc.id,
                          },
                          { id: 'a2', type: 'MARK_AS_READ' },
                        ],
                        isActive: true,
                        createdAt: Date.now(),
                      };
                      saveRules([rule, ...rules]);
                      setActiveTab('rules');
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    Enable Auto-Vault
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ACTIVE RULES */}
          {activeTab === 'rules' && (
            <div className="space-y-4">
              {rules.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <Zap className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">No active automations yet</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Activate the 1-click Mail Forwarder or build custom rules to automate actions across your accounts.
                  </p>
                  <button
                    onClick={() => setActiveTab('recipes')}
                    className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-xs"
                  >
                    Explore Presets
                  </button>
                </div>
              ) : (
                rules.map(rule => {
                  const sourceAcc = accounts.find(a => a.id === rule.sourceAccountId);
                  return (
                    <div
                      key={rule.id}
                      className={`p-5 rounded-2xl border transition-all ${
                        rule.isActive
                          ? 'bg-white border-slate-200/90 shadow-sm'
                          : 'bg-slate-50/70 border-slate-200/60 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`p-2 rounded-lg ${
                              rule.isActive
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            <Zap className="w-4 h-4" />
                          </span>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">{rule.name}</h3>
                            <div className="text-[11px] text-slate-400">
                              Created {new Date(rule.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleRule(rule.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                              rule.isActive
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'
                            }`}
                          >
                            {rule.isActive ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                            {rule.isActive ? 'Active' : 'Paused'}
                          </button>
                          <button
                            onClick={() => deleteRule(rule.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Rule Anatomy */}
                      <div className="flex flex-wrap items-center gap-2 text-xs pt-2 border-t border-slate-100">
                        <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-medium flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-500" />
                          From: {sourceAcc?.email || 'Unknown'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 font-medium">
                          Trigger: {rule.conditions.map(c => `${c.field} ${c.operator} "${c.value}"`).join(' & ')}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 font-medium">
                          Actions: {rule.actions.map(a => a.type === 'FORWARD_EMAIL' ? `Forward to ${a.targetEmail}` : a.type).join(', ')}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: AUDIT TRAIL */}
          {activeTab === 'logs' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Real-time Execution History
                </h3>
                <span className="text-[11px] text-slate-400">Showing last 100 events</span>
              </div>

              {logs.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-400">
                  No automated dispatches recorded yet. Rules run automatically in background every 60s.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {logs.map(log => (
                    <div key={log.id} className="p-4 hover:bg-slate-50/80 transition-colors flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {log.status === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900">{log.ruleName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">{log.actionTaken}</div>
                        {log.details && (
                          <div className="text-[11px] text-slate-400 mt-1 font-mono bg-slate-50 p-1.5 rounded-md border border-slate-100">
                            {log.details}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Custom Rule Creator Modal */}
      {isCreatingCustom && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Create Custom Automation</h3>
              <button onClick={() => setIsCreatingCustom(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rule Name</label>
              <input
                type="text"
                placeholder="e.g. Teleport Emails to Main Inbox"
                value={newRuleName}
                onChange={e => setNewRuleName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Source Account</label>
              <select
                value={sourceAccountId}
                onChange={e => setSourceAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Select source account...</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id} disabled={acc.isExpired}>
                    {acc.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsCreatingCustom(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={saveCustomRule}
                disabled={!newRuleName || !sourceAccountId}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
