// Token refresh only while the app is in the foreground (TB-20 AC3). Supabase docs: on non-browser
// platforms the refresh loop runs continuously unless the app starts/stops it on foreground changes.
import type { AuthClient } from './auth-client';

export type AppStateLike = {
  currentState: string | null | undefined;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
};

type RefreshControls = Pick<AuthClient, 'startAutoRefresh' | 'stopAutoRefresh'>;

/** Starts refreshing now if active, then follows AppState. Returns a function that detaches it. */
export function registerAutoRefresh(auth: RefreshControls, appState: AppStateLike): () => void {
  const apply = (state: string | null | undefined) => {
    if (state === 'active') void auth.startAutoRefresh();
    else void auth.stopAutoRefresh();
  };
  apply(appState.currentState);
  const subscription = appState.addEventListener('change', apply);
  return () => {
    subscription.remove();
    void auth.stopAutoRefresh();
  };
}
