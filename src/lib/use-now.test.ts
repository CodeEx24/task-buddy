import { act, renderHook } from '@testing-library/react-native';

import { NOW_REFRESH_MS, useNow } from './use-now';

describe('useNow', () => {
  it('reads the clock on mount and refreshes it every minute', async () => {
    jest.useFakeTimers({ now: 1_000 });
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');
    try {
      const { result, unmount } = await renderHook(() => useNow());
      expect(result.current).toBe(1_000);
      await act(async () => {
        jest.advanceTimersByTime(NOW_REFRESH_MS);
      });
      expect(result.current).toBe(1_000 + NOW_REFRESH_MS);
      await unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
    } finally {
      clearIntervalSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
