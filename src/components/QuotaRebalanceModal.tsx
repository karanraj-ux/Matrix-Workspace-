import React, { useState, useEffect } from 'react';
import {
  X,
  Scale,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Loader2,
  HardDrive,
  Cloud,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { AccountToken, StorageQuotaInfo } from '../types';
import {
  quotaRebalancer,
  RebalancePlanItem,
  RebalanceResult,
} from '../services/quotaRebalancerDaemon';

interface QuotaRebalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountToken[];
  onRebalanceComplete?: () => void;
}

export const QuotaRebalanceModal: React.FC<QuotaRebalanceModalProps> = ({
  isOpen,
  onClose,
  accounts,
  onRebalanceComplete,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<{
    needed: boolean;
    congestedAccount?: AccountToken;
    targetAccount?: AccountToken;
    quotas: Record<string, StorageQuotaInfo>;
    plans: RebalancePlanItem[];
  } | null>(null);

  const [isExecuting, setIsExecuting] = useState(false);
  const [currentLog, setCurrentLog] = useState('');
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [result, setResult] = useState<RebalanceResult | null>(null);

  useEffect(() => {
    if (isOpen && accounts.length > 0) {
      loadAnalysis();
    } else {
      setAnalysis(null);
      setResult(null);
      setLiveLogs([]);
      setCurrentLog('');
    }
  }, [isOpen, accounts]);

  const loadAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await quotaRebalancer.analyzeRebalanceNeeds(accounts);
      setAnalysis(res);
    } catch (e) {
      console.warn('Analysis error', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    setLiveLogs([]);
    setCurrentLog('Starting rebalance process...');

    const unsubscribe = quotaRebalancer.subscribe((status) => {
      setCurrentLog(status.log);
      setLiveLogs((prev) => [...prev, status.log]);
    });

    try {
      const res = await quotaRebalancer.executeRebalance(accounts, analysis?.plans);
      setResult(res);
      if (onRebalanceComplete) onRebalanceComplete();
      await loadAnalysis();
    } catch (e: any) {
      setLiveLogs((prev) => [...prev, `[Fatal] ${e.message}`]);
    } finally {
      unsubscribe();
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Scale size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Autonomous Quota Rebalancing Daemon</h3>
              <p className="text-[11px] text-slate-400">Dynamic chunk migration and storage eviction engine</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {isAnalyzing ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
              <p className="text-xs text-slate-600 font-medium">Querying multi-cloud quotas and inspecting manifests...</p>
            </div>
          ) : analysis ? (
            <div className="space-y-4">
              {/* Account Quota Utilization Strips */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800">Current Storage Headroom</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {accounts.map((acc) => {
                    const q = analysis.quotas[acc.id];
                    const usedPct = q && q.totalBytes > 0 ? Math.round((q.usedBytes / q.totalBytes) * 100) : 0;
                    const freeMb = q && q.totalBytes > 0 ? Math.round((q.totalBytes - q.usedBytes) / (1024 * 1024)) : 0;

                    return (
                      <div
                        key={acc.id}
                        className="p-3 border border-slate-200 rounded-xl bg-slate-50 flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-900 truncate max-w-[140px]">{acc.email}</span>
                          <span className="text-[10px] uppercase font-bold text-slate-500">{acc.provider || 'google'}</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              usedPct > 80 ? 'bg-amber-500' : 'bg-blue-600'
                            }`}
                            style={{ width: `${usedPct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span>{usedPct}% used</span>
                          <span>{freeMb > 1024 ? `${(freeMb / 1024).toFixed(1)} GB` : `${freeMb} MB`} free</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status / Plan Summary */}
              {analysis.plans.length === 0 ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-emerald-900">Storage Array Optimally Balanced</h4>
                    <p className="text-[11px] text-emerald-700 leading-relaxed">
                      No cloud account exceeds congestion limits. Parity shards and data chunks are proportionally distributed with ample headroom.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">
                        Storage Imbalance Detected ({analysis.plans.length} Chunk Migration Candidates)
                      </h4>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        High headroom exists on {analysis.targetAccount?.email} ({analysis.targetAccount?.provider}). The daemon can safely migrate cold shards.
                      </p>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                    {analysis.plans.map((p, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-xs bg-slate-50/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <HardDrive size={13} className="text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-800 truncate">{p.filename} (Chunk #{p.chunkIndex})</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {(p.chunkSize / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-semibold">
                          <span className="text-amber-600">{p.sourceAccount.provider}</span>
                          <ArrowRight size={11} className="text-slate-400" />
                          <span className="text-emerald-600">{p.targetAccount.provider}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleExecute}
                    disabled={isExecuting}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                  >
                    {isExecuting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    <span>{isExecuting ? 'Migrating Shards Across Providers...' : 'Execute Rebalancing Migration'}</span>
                  </button>
                </div>
              )}

              {/* Execution Console Logs */}
              {liveLogs.length > 0 && (
                <div className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[10px] space-y-1 max-h-40 overflow-y-auto">
                  {liveLogs.map((log, i) => (
                    <div key={i} className="flex items-start gap-1">
                      <span className="text-emerald-400">&gt;</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-blue-600" />
            <span>Zero-Loss Migration (Checksum Verified Before Eviction)</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
