// Jest: replace the supabase-js auth client with the in-memory fake (TB-20). Each test file gets a
// fresh fake that starts SIGNED IN, so route tests written before the sign-in guard (TB-18, TB-21,
// TB-26) still reach Today, Inbox and the task modals as a signed-in user. Auth tests call
// `getFakeAuth().control.reset({ signedIn: false })` to start signed out.
jest.mock('@/features/auth/session/auth-client', () => {
  const { createFakeAuthClient } = jest.requireActual<
    typeof import('@/features/auth/testing/fake-auth-client')
  >('@/features/auth/testing/fake-auth-client');
  const fake = createFakeAuthClient({ signedIn: true });
  return { getAuthClient: () => fake.client, __fake: fake };
});
