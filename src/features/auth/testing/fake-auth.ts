// Test helper: the fake auth client installed by `jest-setup.ts` for the current test file.
import * as authClientModule from '../session/auth-client';
import type { FakeAuthClient } from './fake-auth-client';

export function getFakeAuth(): FakeAuthClient {
  const fake = (authClientModule as unknown as { __fake?: FakeAuthClient }).__fake;
  if (!fake)
    throw new Error(
      'auth-client is not mocked: is src/features/auth/testing/jest-setup.ts in setupFiles?',
    );
  return fake;
}
