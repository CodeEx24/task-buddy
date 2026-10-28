// When sync cycles run (TB-43 AC1: a change shows on the other device within 10 s of it being
// online). Single-flight: one cycle at a time; requests made during a cycle coalesce into one
// follow-up cycle. Triggers come from the provider: start, foreground, a local write, a Realtime
// change, the Realtime channel (re)connecting; plus a retry while failing, and a poll: every
// minute while Realtime is connected (safety net), every 5 s while it is not (so a change still
// arrives within AC1's 10 s when the live channel is down or slow to start).

/** Coalesces bursts (autosave, several Realtime events) into one cycle. */
export const SYNC_DEBOUNCE_MS = 300;
/** While a cycle fails (offline), try again this often: well inside AC1's 10 s. */
export const SYNC_RETRY_MS = 5_000;
/** Safety net if a Realtime event is missed while connected. */
export const SYNC_POLL_MS = 60_000;
/** Poll interval while the Realtime channel is not connected. */
export const SYNC_FALLBACK_POLL_MS = 5_000;

export type SyncTrigger =
  | 'start'
  | 'foreground'
  | 'local-change'
  | 'remote-change'
  | 'reconnect'
  | 'retry'
  | 'poll'
  | 'follow-up';

export type SyncPhase = 'idle' | 'syncing' | 'offline';

export type SyncSchedulerOptions = {
  /** Runs one cycle. Resolves with whether another cycle is needed right away. */
  run: () => Promise<{ needsAnotherCycle: boolean }>;
  onPhase?: (phase: SyncPhase, error?: unknown) => void;
  debounceMs?: number;
  retryMs?: number;
  pollMs?: number;
  fallbackPollMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type SyncScheduler = {
  request: (trigger: SyncTrigger) => void;
  /** Foreground: runs triggers and timers. Background: no timers (battery), requests wait. */
  setActive: (isActive: boolean) => void;
  /** Whether the live (Realtime) channel is connected; sets how often to poll. */
  setLive: (isLive: boolean) => void;
  stop: () => void;
};

export function createSyncScheduler(options: SyncSchedulerOptions): SyncScheduler {
  const debounceMs = options.debounceMs ?? SYNC_DEBOUNCE_MS;
  const retryMs = options.retryMs ?? SYNC_RETRY_MS;
  const pollMs = options.pollMs ?? SYNC_POLL_MS;
  const fallbackPollMs = options.fallbackPollMs ?? SYNC_FALLBACK_POLL_MS;
  const setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer =
    options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let isStopped = false;
  let isActive = true;
  let isRunning = false;
  let hasPending = false;
  let isLive = false;
  let timer: unknown;
  let timerTrigger: SyncTrigger | undefined;

  const cancelTimer = () => {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    timerTrigger = undefined;
  };

  const schedule = (ms: number, trigger: SyncTrigger) => {
    cancelTimer();
    timerTrigger = trigger;
    timer = setTimer(() => {
      timer = undefined;
      timerTrigger = undefined;
      void runNow(trigger);
    }, ms);
  };

  async function runNow(_trigger: SyncTrigger): Promise<void> {
    if (isStopped || !isActive) return;
    if (isRunning) {
      hasPending = true;
      return;
    }
    isRunning = true;
    hasPending = false;
    options.onPhase?.('syncing');
    let next: { ms: number; trigger: SyncTrigger };
    try {
      const result = await options.run();
      if (isStopped) return;
      options.onPhase?.('idle');
      next =
        hasPending || result.needsAnotherCycle
          ? { ms: debounceMs, trigger: 'follow-up' }
          : { ms: isLive ? pollMs : fallbackPollMs, trigger: 'poll' };
    } catch (error) {
      if (isStopped) return;
      options.onPhase?.('offline', error);
      next = hasPending
        ? { ms: debounceMs, trigger: 'follow-up' }
        : { ms: retryMs, trigger: 'retry' };
    } finally {
      isRunning = false;
    }
    if (isActive) schedule(next.ms, next.trigger);
  }

  return {
    request: (trigger) => {
      if (isStopped) return;
      if (isRunning) {
        hasPending = true;
        return;
      }
      if (isActive) schedule(debounceMs, trigger);
      else hasPending = true;
    },
    setActive: (active) => {
      if (isStopped || active === isActive) return;
      isActive = active;
      if (active) schedule(debounceMs, 'foreground');
      else cancelTimer();
    },
    setLive: (live) => {
      if (isStopped || live === isLive) return;
      isLive = live;
      // Lost the live channel while waiting a minute: poll soon instead.
      if (!live && isActive && timerTrigger === 'poll') schedule(fallbackPollMs, 'poll');
    },
    stop: () => {
      isStopped = true;
      cancelTimer();
    },
  };
}
