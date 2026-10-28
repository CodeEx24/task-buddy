// Who may open the 500-task perf seeding route (TB-27 AC3). The owner proves AC3 on a physical
// phone with an EAS `preview` (release) build, whose EXPO_PUBLIC_APP_ENV is `staging`
// (docs/actions/supabase-projects.md). Production never shows it; anything unreadable fails closed.
import type { Env } from '@/lib/env';

/** Dev builds, or release builds of the staging (EAS `preview`) environment. */
export function canShowPerfTools(isDev: boolean, readEnv: () => Pick<Env, 'appEnv'>): boolean {
  if (isDev) return true;
  try {
    return readEnv().appEnv === 'staging';
  } catch {
    // Missing or invalid env (EnvError): hidden.
    return false;
  }
}
