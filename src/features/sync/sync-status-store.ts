// Sync status for the UI (TB-43). UI state only: what is synced is decided by the local DB.
import { create } from 'zustand';

import type { SyncPhase } from './engine/sync-scheduler';

type SyncStatusState = {
  phase: SyncPhase | 'signed-out';
  /** Device time of the last successful cycle, or null if none since sign-in. */
  lastSyncedAt: number | null;
  setPhase: (phase: SyncPhase) => void;
  reset: () => void;
};

export const useSyncStatusStore = create<SyncStatusState>()((set) => ({
  phase: 'signed-out',
  lastSyncedAt: null,
  setPhase: (phase) =>
    set((state) => ({
      phase,
      lastSyncedAt: phase === 'idle' ? Date.now() : state.lastSyncedAt,
    })),
  reset: () => set({ phase: 'signed-out', lastSyncedAt: null }),
}));
