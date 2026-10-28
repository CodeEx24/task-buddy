import { createSyncScheduler, type SyncPhase } from './sync-scheduler';

// Fake timers: debounce / retry / poll timing is what AC1's 10 s budget depends on.
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function setup(run: () => Promise<{ needsAnotherCycle: boolean }>) {
  const phases: SyncPhase[] = [];
  const scheduler = createSyncScheduler({
    run,
    onPhase: (phase) => phases.push(phase),
    debounceMs: 300,
    retryMs: 5000,
    pollMs: 60_000,
    fallbackPollMs: 5000,
    liveGraceMs: 0,
  });
  return { scheduler, phases };
}

const ok = () => Promise.resolve({ needsAnotherCycle: false });

describe('sync scheduler', () => {
  it('coalesces a burst of triggers into one cycle after the debounce', async () => {
    const run = jest.fn(ok);
    const { scheduler } = setup(run);
    scheduler.request('local-change');
    scheduler.request('local-change');
    scheduler.request('remote-change');
    await jest.advanceTimersByTimeAsync(299);
    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('runs one cycle at a time; a request during a cycle runs one follow-up', async () => {
    let finish: () => void = () => {};
    const run = jest.fn(
      () =>
        new Promise<{ needsAnotherCycle: boolean }>((resolve) => {
          finish = () => resolve({ needsAnotherCycle: false });
        }),
    );
    const { scheduler } = setup(run);
    scheduler.request('start');
    await jest.advanceTimersByTimeAsync(300);
    scheduler.request('remote-change');
    scheduler.request('local-change');
    await jest.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await jest.advanceTimersByTimeAsync(300);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('retries every 5 s while offline, then polls every minute once it works', async () => {
    const run = jest
      .fn<Promise<{ needsAnotherCycle: boolean }>, []>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(ok);
    const { scheduler, phases } = setup(run);
    scheduler.setLive(true);
    scheduler.request('start');
    await jest.advanceTimersByTimeAsync(300);
    expect(phases).toEqual(['syncing', 'offline']);
    await jest.advanceTimersByTimeAsync(5000);
    await jest.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(3);
    expect(phases.at(-1)).toBe('idle');
    await jest.advanceTimersByTimeAsync(59_999);
    expect(run).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(4);
    scheduler.stop();
  });

  it('runs again right away when a cycle asks for it (child before parent)', async () => {
    const run = jest
      .fn<Promise<{ needsAnotherCycle: boolean }>, []>()
      .mockResolvedValueOnce({ needsAnotherCycle: true })
      .mockImplementation(ok);
    const { scheduler } = setup(run);
    scheduler.request('start');
    await jest.advanceTimersByTimeAsync(600);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('pauses in the background and catches up on foreground', async () => {
    const run = jest.fn(ok);
    const { scheduler } = setup(run);
    scheduler.setActive(false);
    scheduler.request('remote-change');
    await jest.advanceTimersByTimeAsync(120_000);
    expect(run).not.toHaveBeenCalled();
    scheduler.setActive(true);
    await jest.advanceTimersByTimeAsync(300);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('does nothing after stop (sign-out)', async () => {
    const run = jest.fn(ok);
    const { scheduler } = setup(run);
    scheduler.request('start');
    scheduler.stop();
    scheduler.request('local-change');
    await jest.advanceTimersByTimeAsync(120_000);
    expect(run).not.toHaveBeenCalled();
  });

  it('polls every 5 s while the live channel is down, and every minute while it is up', async () => {
    const run = jest.fn(ok);
    const { scheduler } = setup(run);
    scheduler.request('start');
    await jest.advanceTimersByTimeAsync(300);
    await jest.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2); // not live yet: fast poll
    scheduler.setLive(true);
    await jest.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(3); // that poll was already scheduled
    await jest.advanceTimersByTimeAsync(30_000);
    expect(run).toHaveBeenCalledTimes(3); // live: next poll a minute later
    scheduler.setLive(false);
    await jest.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(4); // dropped: poll soon
    scheduler.stop();
  });

  it('keeps the fast poll for a grace period after the live channel connects', async () => {
    const run = jest.fn(ok);
    const scheduler = createSyncScheduler({
      run,
      debounceMs: 300,
      pollMs: 60_000,
      fallbackPollMs: 5000,
      liveGraceMs: 30_000,
    });
    scheduler.setLive(true);
    scheduler.request('start');
    await jest.advanceTimersByTimeAsync(300);
    await jest.advanceTimersByTimeAsync(25_000);
    expect(run).toHaveBeenCalledTimes(6); // start + a poll every 5 s during the grace period
    await jest.advanceTimersByTimeAsync(5000); // grace over: this poll schedules the next in 60 s
    await jest.advanceTimersByTimeAsync(59_000);
    expect(run).toHaveBeenCalledTimes(7);
    scheduler.stop();
  });
});
