import { addLocalDays } from '@/lib/dates';

import {
  availableQuickActions,
  quickActionAnnouncement,
  quickActionForSwipe,
  quickActionLabel,
  quickActionPatch,
} from './task-actions';

const NOW = new Date(2026, 9, 28, 15, 30).getTime();
const open = { status: 'open' as const, title: 'Pay rent' };
const done = { status: 'done' as const, title: 'Pay rent' };

describe('task quick actions (TB-27 AC2)', () => {
  it('maps the finger direction: right → toggle done, left → tomorrow', () => {
    expect(quickActionForSwipe('right')).toBe('toggle-done');
    expect(quickActionForSwipe('left')).toBe('tomorrow');
  });

  it("matches gesture-handler's SwipeDirection values (the direction the finger moved)", () => {
    // The props module only declares the enum; loading it needs no native runtime.
    const { SwipeDirection } = jest.requireActual<{
      SwipeDirection: { LEFT: string; RIGHT: string };
    }>(
      'react-native-gesture-handler/lib/module/components/ReanimatedSwipeable/ReanimatedSwipeableProps',
    );
    expect(SwipeDirection).toEqual({ LEFT: 'left', RIGHT: 'right' });
  });

  it('offers reschedule on open tasks only', () => {
    expect(availableQuickActions(open)).toEqual(['toggle-done', 'tomorrow']);
    expect(availableQuickActions(done)).toEqual(['toggle-done']);
  });

  it('builds the repository patch', () => {
    expect(quickActionPatch('toggle-done', open, NOW)).toEqual({ status: 'done' });
    expect(quickActionPatch('toggle-done', done, NOW)).toEqual({ status: 'open' });
    // Tomorrow = local midnight of the next calendar day, whatever the current due date.
    expect(quickActionPatch('tomorrow', open, NOW)).toEqual({ dueAt: addLocalDays(NOW, 1) });
    expect(quickActionPatch('tomorrow', open, NOW)).toEqual({
      dueAt: new Date(2026, 9, 29).getTime(),
    });
  });

  it('labels and announces each action', () => {
    expect(quickActionLabel('toggle-done', open)).toBe('Complete');
    expect(quickActionLabel('toggle-done', done)).toBe('Mark as not done');
    expect(quickActionLabel('tomorrow', open)).toBe('Move to tomorrow');
    expect(quickActionAnnouncement('toggle-done', open)).toBe('Pay rent completed');
    expect(quickActionAnnouncement('toggle-done', done)).toBe('Pay rent marked as not done');
    expect(quickActionAnnouncement('tomorrow', open)).toBe('Pay rent moved to tomorrow');
  });
});
