import {
  resolveSwipe,
  SWIPE_ACTIVATION_DISTANCE,
  SWIPE_COMMIT_DISTANCE,
  SWIPE_PAN_OFFSETS,
  SWIPE_PANEL_WIDTH,
  SWIPE_VERTICAL_FAIL_DISTANCE,
  swipeRowOffset,
} from './swipe-row-config';

/** Emulator density of the device finding (420 dpi): px → pt. */
const pt = (px: number) => px / 2.625;

/**
 * Gesture-handler's pre-activation rule for this config, walked along a straight drag: the pan
 * fails once |dy| leaves the fail range, and activates once |dx| leaves the active range —
 * whichever comes first.
 */
function firstCrossing(dx: number, dy: number): 'activates' | 'fails' | 'nothing' {
  const steps = 200;
  for (let i = 1; i <= steps; i++) {
    const [x, y] = [(dx * i) / steps, (dy * i) / steps];
    if (Math.abs(y) > SWIPE_VERTICAL_FAIL_DISTANCE) return 'fails';
    if (Math.abs(x) > SWIPE_ACTIVATION_DISTANCE) return 'activates';
  }
  return 'nothing';
}

describe('SwipeRow gesture rules (TB-27)', () => {
  it('configures the pan: 20 pt horizontal to activate, 12 pt vertical fails it first', () => {
    expect(SWIPE_PAN_OFFSETS).toEqual({ activeOffsetX: [-20, 20], failOffsetY: [-12, 12] });
    expect(SWIPE_COMMIT_DISTANCE).toBe(72);
  });

  it('a vertical-dominant drag never activates the row (device finding: 250 px right, 400 px down)', () => {
    expect(firstCrossing(pt(250), pt(400))).toBe('fails');
    expect(firstCrossing(pt(-250), pt(400))).toBe('fails');
    expect(firstCrossing(30, 31)).toBe('fails');
    expect(firstCrossing(0, 300)).toBe('fails');
  });

  it('straight and slightly drifting horizontal swipes activate', () => {
    expect(firstCrossing(pt(750), 0)).toBe('activates'); // adb 150 → 900
    expect(firstCrossing(-pt(750), 0)).toBe('activates');
    expect(firstCrossing(100, 50)).toBe('activates'); // dy 10 when dx passes 20
  });

  it('never commits a release that is more vertical than horizontal, even after activating', () => {
    expect(resolveSwipe({ translationX: 95, translationY: 152, velocityX: 0 }, true, true)).toBe(
      null,
    );
    expect(resolveSwipe({ translationX: -100, translationY: 100, velocityX: 0 }, true, true)).toBe(
      null,
    );
  });

  it('commits past 72 pt (velocity adds a little), on the side the finger moved', () => {
    const release = (translationX: number, velocityX = 0) =>
      resolveSwipe({ translationX, translationY: 4, velocityX }, true, true);
    expect(release(72)).toBe('right');
    expect(release(-72)).toBe('left');
    expect(release(71)).toBe(null);
    expect(release(pt(120))).toBe(null); // the short adb swipe 300 → 420 springs back
    expect(release(50, 600)).toBe('right'); // quick flick: 50 + 0.05 × 600 = 80
    expect(release(80, -1000)).toBe(null); // dragged out but flicked back: 80 − 50 < 72
  });

  it('respects missing panels', () => {
    const release = { translationX: -200, translationY: 0, velocityX: 0 };
    expect(resolveSwipe(release, true, false)).toBe(null);
    expect(swipeRowOffset(-50, true, false)).toBe(0);
    expect(swipeRowOffset(50, false, true)).toBe(0);
  });

  it('follows the finger up to the panel width, then resists 1:8', () => {
    expect(swipeRowOffset(60, true, true)).toBe(60);
    expect(swipeRowOffset(-SWIPE_PANEL_WIDTH, true, true)).toBe(-SWIPE_PANEL_WIDTH);
    expect(swipeRowOffset(SWIPE_PANEL_WIDTH + 80, true, true)).toBe(SWIPE_PANEL_WIDTH + 10);
  });
});
