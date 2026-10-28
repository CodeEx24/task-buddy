import { act } from '@testing-library/react-native';

import { UNDO_WINDOW_MS, useUndoStore } from './undo-store';

const offer = () => useUndoStore.getState().offer;

beforeEach(() => {
  jest.useFakeTimers();
  useUndoStore.getState().dismissUndo();
});
afterEach(() => jest.useRealTimers());

describe('undo store', () => {
  it('offers undo for 5 seconds, then expires', () => {
    act(() => useUndoStore.getState().offerUndo('task-a'));
    expect(offer()?.taskId).toBe('task-a');

    act(() => jest.advanceTimersByTime(UNDO_WINDOW_MS - 1));
    expect(offer()?.taskId).toBe('task-a');
    act(() => jest.advanceTimersByTime(1));
    expect(offer()).toBeNull();
  });

  it('a newer delete replaces the offer and restarts the window', () => {
    act(() => useUndoStore.getState().offerUndo('task-a'));
    act(() => jest.advanceTimersByTime(4000));
    act(() => useUndoStore.getState().offerUndo('task-b'));
    act(() => jest.advanceTimersByTime(4000));
    expect(offer()?.taskId).toBe('task-b');
    act(() => jest.advanceTimersByTime(1000));
    expect(offer()).toBeNull();
  });

  it('dismiss hides the offer at once', () => {
    act(() => useUndoStore.getState().offerUndo('task-a'));
    act(() => useUndoStore.getState().dismissUndo());
    expect(offer()).toBeNull();
  });
});
