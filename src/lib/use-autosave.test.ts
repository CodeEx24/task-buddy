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

  it('makes exactly one attempt per distinct value when every save fails (optimistic + rollback)', async () => {
    const { save, rerender, unmount } = await setup({ pending: { title: 'a' } });
    save.mockRejectedValue(new Error('db'));

    // Each cycle mirrors the detail screen: the optimistic update clears `pending`, the rollback
    // makes the same value pending again. Without the failed-value block this loops every 500 ms.
    const failCycle = async (title: string) => {
      await advance(AUTOSAVE_DELAY_MS);
      await rerender({ pending: null });
      await rerender({ pending: { title } });
      await advance(AUTOSAVE_DELAY_MS * 5);
    };

    await failCycle('a');
    expect(save).toHaveBeenCalledTimes(1);

    // The user edits again: one new attempt for the new value, still no loop.
    await rerender({ pending: { title: 'ab' } });
    await failCycle('ab');
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls.map(([value]) => value.title)).toEqual(['a', 'ab']);

    // Closing the screen doesn't retry a value that already failed either.
    await unmount();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('saves a value again when it is edited back to after an optimistic save', async () => {
    const { save, rerender } = await setup({ pending: { title: 'a' } });
    await advance(AUTOSAVE_DELAY_MS);
    // Optimistic update: nothing pending; the write resolves afterwards.
    await rerender({ pending: null });
    await rerender({ pending: { title: 'ab' } });
    await advance(AUTOSAVE_DELAY_MS);
    await rerender({ pending: null });
    await rerender({ pending: { title: 'a' } });
    await advance(AUTOSAVE_DELAY_MS);
    expect(save.mock.calls.map(([value]) => value.title)).toEqual(['a', 'ab', 'a']);
  });

  it('retries a failed value once another value was attempted', async () => {
    const { save, rerender } = await setup({ pending: { title: 'a' } });
    save.mockRejectedValueOnce(new Error('db'));
    await advance(AUTOSAVE_DELAY_MS);
    await rerender({ pending: { title: 'ab' } });
    await advance(AUTOSAVE_DELAY_MS);
    await rerender({ pending: { title: 'a' } });
    await advance(AUTOSAVE_DELAY_MS);
    expect(save.mock.calls.map(([value]) => value.title)).toEqual(['a', 'ab', 'a']);
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
