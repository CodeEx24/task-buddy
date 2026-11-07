import { registerAutoRefresh, type AppStateLike } from './app-state-refresh';

function createAppState(initial: string) {
  const listeners = new Set<(state: string) => void>();
  const appState: AppStateLike = {
    currentState: initial,
    addEventListener: (_type, listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  const set = (state: string) => {
    appState.currentState = state;
    for (const listener of listeners) listener(state);
  };
  return { appState, set, listenerCount: () => listeners.size };
}

const createAuth = () => ({
  startAutoRefresh: jest.fn(async () => {}),
  stopAutoRefresh: jest.fn(async () => {}),
});

describe('registerAutoRefresh (TB-20 AC3)', () => {
  it('starts refreshing when the app is active and stops in the background', () => {
    const auth = createAuth();
    const { appState, set } = createAppState('active');
    registerAutoRefresh(auth, appState);
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);

    set('background');
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    set('active');
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('does not refresh when registered in the background', () => {
    const auth = createAuth();
    registerAutoRefresh(auth, createAppState('background').appState);
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('detaches its listener and stops refreshing on cleanup', () => {
    const auth = createAuth();
    const { appState, set, listenerCount } = createAppState('active');
    const detach = registerAutoRefresh(auth, appState);
    detach();
    expect(listenerCount()).toBe(0);
    set('active');
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });
});
