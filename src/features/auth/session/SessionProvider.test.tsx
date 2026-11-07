import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { getFakeAuth } from '../testing/fake-auth';
import { SESSION_RESTORE_TIMEOUT_MS, SessionProvider, useSession } from './SessionProvider';

function SessionProbe() {
  const { isLoading, isSignedIn } = useSession();
  return <Text testID="probe">{isLoading ? 'loading' : isSignedIn ? 'in' : 'out'}</Text>;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('SessionProvider restore timeout (TB-20 security review)', () => {
  it('fails closed to signed out if the stored session is not read within 5 s', async () => {
    const fake = getFakeAuth();
    fake.control.reset({ signedIn: true, holdInitialSession: true });
    await render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('loading');

    await act(() => jest.advanceTimersByTime(SESSION_RESTORE_TIMEOUT_MS - 1));
    expect(screen.getByTestId('probe')).toHaveTextContent('loading');
    await act(() => jest.advanceTimersByTime(1));
    expect(screen.getByTestId('probe')).toHaveTextContent('out');

    // A late restore still signs the user in.
    await act(() => fake.control.releaseInitialSession());
    expect(screen.getByTestId('probe')).toHaveTextContent('in');
  });

  it('does not override a session restored in time', async () => {
    getFakeAuth().control.reset({ signedIn: true });
    await render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>,
    );
    await act(() => jest.advanceTimersByTime(SESSION_RESTORE_TIMEOUT_MS * 2));
    expect(screen.getByTestId('probe')).toHaveTextContent('in');
  });
});
