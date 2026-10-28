import {
  createTabSwitchTimer,
  isTabTimingEnabled,
  TAB_SWITCH_LOG_PREFIX,
} from './tab-switch-timing';

function setup(isEnabled = true) {
  let clock = 0;
  const log = jest.fn<void, [string]>();
  const timer = createTabSwitchTimer({ now: () => clock, log, isEnabled });
  const advance = (ms: number) => {
    clock += ms;
  };
  return { timer, log, advance };
}

describe('createTabSwitchTimer', () => {
  it('logs the elapsed time from a tab press to that tab gaining focus', () => {
    const { timer, log, advance } = setup();

    timer.markPress('inbox');
    advance(42.25);

    expect(timer.reportFocus('inbox')).toBe(42.25);
    expect(log).toHaveBeenCalledWith(`${TAB_SWITCH_LOG_PREFIX} inbox 42.3ms`);
  });

  it('reports each press once', () => {
    const { timer, log } = setup();

    timer.markPress('buddy');
    timer.reportFocus('buddy');

    expect(timer.reportFocus('buddy')).toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('ignores focus without a press (initial render, deep links, back navigation)', () => {
    const { timer, log } = setup();

    expect(timer.reportFocus('index')).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it('ignores focus of a different tab than the one pressed', () => {
    const { timer, log } = setup();

    timer.markPress('settings');

    expect(timer.reportFocus('inbox')).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it('does nothing when disabled (release builds)', () => {
    const { timer, log } = setup(false);

    timer.markPress('inbox');

    expect(timer.reportFocus('inbox')).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });
});

describe('isTabTimingEnabled', () => {
  it('is on in development builds', () => {
    expect(isTabTimingEnabled(true, undefined)).toBe(true);
  });

  it('is on in a production-mode bundle only with EXPO_PUBLIC_TAB_TIMING=1', () => {
    expect(isTabTimingEnabled(false, '1')).toBe(true);
  });

  it.each([undefined, '', '0', 'true'])('is off in release builds when the flag is %p', (flag) => {
    expect(isTabTimingEnabled(false, flag)).toBe(false);
  });
});
