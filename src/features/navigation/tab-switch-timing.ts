/**
 * Dev-only tab-switch timing (TB-18, AC1 "renders in under 300 ms").
 *
 * `markPress` runs on the tab bar's `tabPress` event. `reportFocus` runs on the first animation
 * frame after the target tab gains focus and logs `[tab-switch] <tab> <ms>ms`. The coordinator
 * reads these lines from the Android emulator (production-mode JS bundle) and records p95 in
 * `docs/tickets/TB-18/verification.md`. Only tab route names are logged, never task data.
 * Disabled outside `__DEV__`.
 */

export const TAB_SWITCH_LOG_PREFIX = '[tab-switch]';

export type TabSwitchTimer = {
  /** Records the moment a tab was pressed. */
  markPress: (tabName: string) => void;
  /** Logs and returns the elapsed ms since the matching press, or `undefined` if none is pending. */
  reportFocus: (tabName: string) => number | undefined;
};

export type TabSwitchTimerDeps = {
  now: () => number;
  log: (message: string) => void;
  isEnabled: boolean;
};

export function createTabSwitchTimer({ now, log, isEnabled }: TabSwitchTimerDeps): TabSwitchTimer {
  let pending: { tabName: string; startedAt: number } | undefined;

  return {
    markPress(tabName) {
      if (!isEnabled) return;
      pending = { tabName, startedAt: now() };
    },
    reportFocus(tabName) {
      if (!isEnabled || pending?.tabName !== tabName) return undefined;
      const elapsedMs = now() - pending.startedAt;
      pending = undefined;
      log(`${TAB_SWITCH_LOG_PREFIX} ${tabName} ${elapsedMs.toFixed(1)}ms`);
      return elapsedMs;
    },
  };
}

export const tabSwitchTimer = createTabSwitchTimer({
  now: () => performance.now(),
  // Dev-only measurement output; the timer is disabled in release builds.
  log: (message) => console.log(message),
  isEnabled: __DEV__,
});
