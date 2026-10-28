// Jest stand-in for gesture-handler's ReanimatedSwipeable (TB-27), installed for every test by
// jest-setup.ts: the real one needs Reanimated's native runtime, and a pan gesture can't be driven
// from Jest anyway. It renders both action panels plus two test buttons,
// `<testID>-swipe-right` / `<testID>-swipe-left`, that do what releasing a swipe past the
// threshold does: call `onSwipeableOpen` with the direction the finger moved.
import { useImperativeHandle } from 'react';
import { Pressable, View } from 'react-native';
import type {
  SwipeableMethods,
  SwipeableProps,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';

type OpenDirection = Parameters<NonNullable<SwipeableProps['onSwipeableOpen']>>[0];

// The library's `SwipeDirection` values ('left' / 'right' = where the finger moved). This file
// replaces the module, and loading the real one inside a mock factory breaks Reanimated's setup.
export const SwipeDirection = {
  LEFT: 'left' as OpenDirection,
  RIGHT: 'right' as OpenDirection,
};

/** Every `close()` the rows called, to assert the row snaps back after an action. */
export const swipeableClose = jest.fn();

const methods: SwipeableMethods = {
  close: swipeableClose,
  openLeft: jest.fn(),
  openRight: jest.fn(),
  reset: jest.fn(),
};

const ZERO = { value: 0, get: () => 0, set: () => {} } as unknown as SharedValue<number>;

export default function SwipeableMock({
  ref,
  testID,
  children,
  renderLeftActions,
  renderRightActions,
  onSwipeableOpen,
}: SwipeableProps) {
  useImperativeHandle(ref, () => methods);
  return (
    <View testID={testID}>
      {renderLeftActions ? (
        <>
          {renderLeftActions(ZERO, ZERO, methods)}
          <Pressable
            testID={`${testID}-swipe-right`}
            onPress={() => onSwipeableOpen?.(SwipeDirection.RIGHT)}
          />
        </>
      ) : null}
      {renderRightActions ? (
        <>
          {renderRightActions(ZERO, ZERO, methods)}
          <Pressable
            testID={`${testID}-swipe-left`}
            onPress={() => onSwipeableOpen?.(SwipeDirection.LEFT)}
          />
        </>
      ) : null}
      {children}
    </View>
  );
}
