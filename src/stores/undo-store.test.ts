import { UNDO_WINDOW_MS, useUndoStore } from './undo-store';

const offer = () => useUndoStore.getState().offer;

beforeEach(() => {
  jest.useFakeTimers();
  useUndoStore.getState().dismissUndo();
});
afterEach(() => jest.useRealTimers());

describe('undo store', () => {
  it('offers undo for 5 seconds, then expires', () => {
    useUndoStore.getState().offerUndo('task-a');
    expect(offer()?.taskId).toBe('task-a');

    jest.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(offer()?.taskId).toBe('task-a');
    jest.advanceTimersByTime(1);
    expect(offer()).toBeNull();
  });

  it('a newer delete replaces the offer and restarts the window', () => {
    useUndoStore.getState().offerUndo('task-a');
    jest.advanceTimersByTime(4000);
    useUndoStore.getState().offerUndo('task-b');
    jest.advanceTimersByTime(4000);
    expect(offer()?.taskId).toBe('task-b');
    jest.advanceTimersByTime(1000);
    expect(offer()).toBeNull();
  });

  it('dismiss hides the offer at once', () => {
    useUndoStore.getState().offerUndo('task-a');
    useUndoStore.getState().dismissUndo();
    expect(offer()).toBeNull();
  });
});
