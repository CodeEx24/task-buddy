import { EnvError } from '@/lib/env';

import { canShowPerfTools } from './perf-tools';

const env = (appEnv: 'development' | 'staging' | 'production') => () => ({ appEnv });

describe('canShowPerfTools (TB-27)', () => {
  it('shows in dev builds whatever the env', () => {
    expect(canShowPerfTools(true, env('production'))).toBe(true);
    expect(
      canShowPerfTools(true, () => {
        throw new EnvError([]);
      }),
    ).toBe(true);
  });

  it('in release builds shows only for staging (EAS preview)', () => {
    expect(canShowPerfTools(false, env('staging'))).toBe(true);
    expect(canShowPerfTools(false, env('production'))).toBe(false);
    expect(canShowPerfTools(false, env('development'))).toBe(false);
  });

  it('fails closed when the env is missing or invalid', () => {
    expect(
      canShowPerfTools(false, () => {
        throw new EnvError([{ name: 'EXPO_PUBLIC_APP_ENV', rule: 'is required' }]);
      }),
    ).toBe(false);
  });
});
