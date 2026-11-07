import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';

import { useUndoStore } from '@/stores/undo-store';

import { SessionProvider } from '../session/SessionProvider';
import { getFakeAuth } from '../testing/fake-auth';
import { QueryCacheReset } from './QueryCacheReset';

describe('QueryCacheReset (TB-20, spec D7-A)', () => {
  it('clears cached queries when the session ends, and not before', async () => {
    getFakeAuth().control.reset({ signedIn: true });
    const client = new QueryClient();
    client.setQueryData(['tasks'], ['cached']);
    const clear = jest.spyOn(client, 'clear');
    const dismissUndo = jest.spyOn(useUndoStore.getState(), 'dismissUndo');

    await render(
      <QueryClientProvider client={client}>
        <SessionProvider>
          <QueryCacheReset />
        </SessionProvider>
      </QueryClientProvider>,
    );
    expect(clear).not.toHaveBeenCalled();
    expect(dismissUndo).not.toHaveBeenCalled();

    await act(() => getFakeAuth().control.expireSession());

    expect(clear).toHaveBeenCalledTimes(1);
    expect(dismissUndo).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['tasks'])).toBeUndefined();
    client.clear();
  });
});
