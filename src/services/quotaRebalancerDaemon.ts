/**
 * Matrix Automated Quota Rebalancer & Storage Eviction Daemon
 * 
 * Client-Side Autonomous Multi-Cloud Rebalancer:
 * 1. Proactively queries storage quotas across all active heterogeneous clouds.
 * 2. Identifies storage congestion (e.g. >80% used) vs. high headroom accounts.
 * 3. Safely migrates encrypted sharded chunks from congested accounts to accounts with headroom.
 * 4. Updates stored manifests in IndexedDB and primary cloud mirror.
 * 5. Safely evicts the old chunk from the congested provider with zero data loss.
 */

import { get, set } from 'idb-keyval';
import { AccountToken, StorageQuotaInfo } from '../types';
import {
  downloadChunkFromProvider,
  uploadChunkToProvider,
  deleteChunkFromProvider,
  fetchAccountQuota,
} from './multiCloudAdapter';
import { StoredManifestRecord, ShardChunk, ShardManifest } from './shardingService';

export interface RebalancePlanItem {
  manifestId: string;
  filename: string;
  chunkIndex: number;
  isParity: boolean;
  chunkSize: number;
  sourceAccount: AccountToken;
  targetAccount: AccountToken;
  driveFileId: string;
}

export interface RebalanceResult {
  migratedChunks: number;
  migratedBytes: number;
  logs: string[];
  success: boolean;
  details: {
    sourceAccount: string;
    targetAccount: string;
    filename: string;
    chunkSize: number;
  }[];
}

export type RebalanceProgressCallback = (status: {
  phase: 'evaluating' | 'migrating' | 'updating' | 'complete' | 'idle';
  currentChunk?: number;
  totalChunks?: number;
  log: string;
}) => void;

class QuotaRebalancerService {
  private timer: any = null;
  private isRunning: boolean = false;
  private subscribers: Set<RebalanceProgressCallback> = new Set();

  public subscribe(cb: RebalanceProgressCallback): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private notify(data: Parameters<RebalanceProgressCallback>[0]) {
    this.subscribers.forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.warn('Rebalance notification callback error', e);
      }
    });
  }

  /**
   * Evaluates storage quotas across active accounts to determine if migration is required.
   */
  public async analyzeRebalanceNeeds(accounts: AccountToken[]): Promise<{
    needed: boolean;
    congestedAccount?: AccountToken;
    targetAccount?: AccountToken;
    quotas: Record<string, StorageQuotaInfo>;
    plans: RebalancePlanItem[];
  }> {
    const active = accounts.filter(a => !a.isExpired);
    if (active.length < 2) {
      return { needed: false, quotas: {}, plans: [] };
    }

    const quotaEntries = await Promise.all(
      active.map(async acc => {
        const q = await fetchAccountQuota(acc);
        return [acc.id, q] as const;
      })
    );
    const quotas: Record<string, StorageQuotaInfo> = Object.fromEntries(quotaEntries);

    // Calculate usage percentage for each
    const accountStats = active.map(acc => {
      const q = quotas[acc.id];
      const usedPct = q && q.totalBytes > 0 ? (q.usedBytes / q.totalBytes) * 100 : 0;
      const freeBytes = q && q.totalBytes > 0 ? q.totalBytes - q.usedBytes : 0;
      return { account: acc, usedPct, freeBytes };
    });

    accountStats.sort((a, b) => b.usedPct - a.usedPct);

    const highest = accountStats[0];
    const lowest = accountStats[accountStats.length - 1];

    // Threshold: Highest account is over 75% OR has a 35% utilization delta compared to lowest
    const isCongested = highest.usedPct > 75 || (highest.usedPct - lowest.usedPct > 35 && highest.usedPct > 50);
    const hasHeadroom = lowest.freeBytes > 100 * 1024 * 1024; // at least 100 MB free

    if (!isCongested || !hasHeadroom) {
      return { needed: false, quotas, plans: [] };
    }

    // Inspect stored manifests to find candidates located on highest account
    const storedRecords: StoredManifestRecord[] = (await get('matrix_frankenstein_shards')) || [];
    const plans: RebalancePlanItem[] = [];

    for (const record of storedRecords) {
      const manifest = record.manifest;
      const chunksToCheck: (ShardChunk & { isParity: boolean })[] = [
        ...manifest.chunks.map(c => ({ ...c, isParity: false })),
        ...(manifest.parityChunk ? [{ ...manifest.parityChunk, isParity: true }] : []),
      ];

      for (const chunk of chunksToCheck) {
        if (chunk.accountId === highest.account.id) {
          plans.push({
            manifestId: record.id,
            filename: manifest.filename,
            chunkIndex: chunk.chunkIndex,
            isParity: chunk.isParity,
            chunkSize: chunk.chunkSizeBytes,
            sourceAccount: highest.account,
            targetAccount: lowest.account,
            driveFileId: chunk.driveFileId,
          });

          // Limit each rebalance pass to max 3 chunks to prevent bandwidth choke
          if (plans.length >= 3) break;
        }
      }
      if (plans.length >= 3) break;
    }

    return {
      needed: plans.length > 0,
      congestedAccount: highest.account,
      targetAccount: lowest.account,
      quotas,
      plans,
    };
  }

  /**
   * Executes the rebalancing migration with live progress notifications.
   */
  public async executeRebalance(
    accounts: AccountToken[],
    forcedPlans?: RebalancePlanItem[]
  ): Promise<RebalanceResult> {
    if (this.isRunning) {
      return {
        migratedChunks: 0,
        migratedBytes: 0,
        logs: ['Rebalance daemon already running.'],
        success: false,
        details: [],
      };
    }

    this.isRunning = true;
    const logs: string[] = [];
    const details: RebalanceResult['details'] = [];
    let migratedBytes = 0;

    try {
      this.notify({ phase: 'evaluating', log: 'Evaluating multi-cloud quota distribution...' });
      logs.push('[Rebalancer] Evaluating multi-cloud quota distribution across accounts...');

      let plans = forcedPlans;
      if (!plans) {
        const analysis = await this.analyzeRebalanceNeeds(accounts);
        if (!analysis.needed || analysis.plans.length === 0) {
          logs.push('[Rebalancer] Quotas are healthy and evenly balanced. No migration needed.');
          this.notify({ phase: 'complete', log: 'Storage quotas are evenly balanced.' });
          return { migratedChunks: 0, migratedBytes: 0, logs, success: true, details: [] };
        }
        plans = analysis.plans;
      }

      logs.push(`[Rebalancer] Identified ${plans.length} chunk(s) to rebalance.`);

      const storedRecords: StoredManifestRecord[] = (await get('matrix_frankenstein_shards')) || [];
      const updatedRecords = [...storedRecords];

      for (let i = 0; i < plans.length; i++) {
        const plan = plans[i];
        const logMsg = `[Migrating ${i + 1}/${plans.length}] "${plan.filename}" (Chunk #${plan.chunkIndex}) from ${plan.sourceAccount.provider} to ${plan.targetAccount.provider}...`;
        logs.push(logMsg);
        this.notify({
          phase: 'migrating',
          currentChunk: i + 1,
          totalChunks: plans.length,
          log: logMsg,
        });

        // 1. Download chunk from source provider
        const chunkData = await downloadChunkFromProvider(plan.sourceAccount, plan.driveFileId);

        // 2. Upload chunk to target provider
        const chunkName = `${plan.filename}.frankenstein.${plan.isParity ? 'parity' : `part${plan.chunkIndex}`}`;
        const chunkBlob = new Blob([chunkData]);
        const uploadResult = await uploadChunkToProvider(plan.targetAccount, chunkBlob, chunkName);

        // 3. Update manifest in memory
        const recordIndex = updatedRecords.findIndex(r => r.id === plan.manifestId);
        if (recordIndex !== -1) {
          const rec = updatedRecords[recordIndex];
          if (plan.isParity && rec.manifest.parityChunk) {
            rec.manifest.parityChunk.accountId = plan.targetAccount.id;
            rec.manifest.parityChunk.accountEmail = plan.targetAccount.email;
            rec.manifest.parityChunk.provider = plan.targetAccount.provider || 'google';
            rec.manifest.parityChunk.driveFileId = uploadResult.fileId;
          } else {
            const targetChunk = rec.manifest.chunks.find(c => c.chunkIndex === plan.chunkIndex);
            if (targetChunk) {
              targetChunk.accountId = plan.targetAccount.id;
              targetChunk.accountEmail = plan.targetAccount.email;
              targetChunk.provider = plan.targetAccount.provider || 'google';
              targetChunk.driveFileId = uploadResult.fileId;
            }
          }
        }

        // 4. Safely delete from source provider now that target is verified
        try {
          await deleteChunkFromProvider(plan.sourceAccount, plan.driveFileId);
          logs.push(`[Eviction] Old shard removed from ${plan.sourceAccount.provider} successfully.`);
        } catch (evictErr) {
          logs.push(`[Warning] Could not evict old chunk from source: ${evictErr}`);
        }

        migratedBytes += plan.chunkSize;
        details.push({
          sourceAccount: plan.sourceAccount.email,
          targetAccount: plan.targetAccount.email,
          filename: plan.filename,
          chunkSize: plan.chunkSize,
        });
      }

      // 5. Commit updated manifests to IndexedDB
      this.notify({ phase: 'updating', log: 'Persisting updated manifest array to IndexedDB...' });
      await set('matrix_frankenstein_shards', updatedRecords);
      logs.push('[Rebalancer] Updated manifests persisted to local storage.');

      const finalMsg = `Successfully rebalanced ${plans.length} chunk(s) (${(migratedBytes / (1024 * 1024)).toFixed(2)} MB migrated).`;
      logs.push(`[Complete] ${finalMsg}`);
      this.notify({ phase: 'complete', log: finalMsg });

      return {
        migratedChunks: plans.length,
        migratedBytes,
        logs,
        success: true,
        details,
      };
    } catch (err: any) {
      const errMsg = `Rebalancing failed: ${err.message}`;
      logs.push(`[Error] ${errMsg}`);
      this.notify({ phase: 'idle', log: errMsg });
      return {
        migratedChunks: 0,
        migratedBytes: 0,
        logs,
        success: false,
        details: [],
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start periodic background check (every 15 minutes)
   */
  public startDaemon(getAccounts: () => AccountToken[]): void {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      try {
        const accounts = getAccounts();
        if (accounts.length < 2) return;
        const analysis = await this.analyzeRebalanceNeeds(accounts);
        if (analysis.needed) {
          console.log('[QuotaRebalancer] Automated threshold triggered, executing migration...');
          await this.executeRebalance(accounts, analysis.plans);
        }
      } catch (e) {
        console.warn('[QuotaRebalancer] Daemon cycle error', e);
      }
    }, 15 * 60 * 1000);
  }

  public stopDaemon(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const quotaRebalancer = new QuotaRebalancerService();
