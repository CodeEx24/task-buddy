import { act, renderHook } from '@testing-library/react-native';

import { AUTOSAVE_DELAY_MS, useAutosave } from './use-autosave';

type Props = { pending: { title: string } | null };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(initial: Props) {
  const save = jest.fn<Promise<void>, [{ title: string }]>(() => Promise.resolve());
  const hook = await renderHook((props: Props) => useAutosave(props.pending, save), {
    initialProps: initial,
  });
  return { save, ...hook };
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('useAutosave (TB-28)', () => {
  it('saves 500 ms after the last change, once', async () => {
    const { save, rerender } = await setup({ pending: { title: 'a' } });
    await advance(300);
    await rerender({ pending: { title: 'ab' } });
    await advance(AUTOSAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();
    await advance(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: 'ab' });
    await advance(AUTOSAVE_DELAY_MS * 4);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does nothing while there is nothing to save', async () => {
    const { save } = await setup({ pending: null });
    await advance(AUTOSAVE_DELAY_MS * 2);
    expect(save).not.toHaveBeenCalled();
  });

  it('does not restart the timer for a new object with the same content', async () => {
    const { save, rerender } = await setup({ pending: { title: 'a' } });
    await advance(400);
    await rerender({ pending: { title: 'a' } });
    await advance(100);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saves a waiting change when the component unmounts', async () => {
    const { save, unmount } = await setup({ pending: { title: 'a' } });
    await advance(100);
    await unmount();
    expect(save).toHaveBeenCalledWith({ title: 'a' });
    await advance(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush saves now, and the timer does not save it again', async () => {
    const { save, result } = await setup({ pending: { title: 'a' } });
    await act(() => result.current.flush());
    expect(save).toHaveBeenCalledTimes(1);
    await advance(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not retry a change that already failed until it changes again', async () => {
    const { save, rerender } = await setup({ pending: { title: 'a' } });
    save.mockRejectedValueOnce(new Error('db'));
    await advance(AUTOSAVE_DELAY_MS);
    // The failed change is still pending (rolled back), but it is not saved in a loop.
    await rerender({ pending: { title: 'a' } });
    await advance(AUTOSAVE_DELAY_MS * 3);
    expect(save).toHaveBeenCalledTimes(1);
    await rerender({ pending: { title: 'ab' } });
    await advance(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('saves the same value again after it was saved and changed back', async () => {
    const { save, rerender } = await setup({ pending: { title: 'a' } });
    await advance(AUTOSAVE_DELAY_MS);
    await rerender({ pending: null });
    await rerender({ pending: { title: 'a' } });
    await advance(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
