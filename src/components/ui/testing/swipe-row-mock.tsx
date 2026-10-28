// Jest stand-in for `SwipeRow` (TB-27), installed for every test by jest-setup.ts: the real row
// needs Reanimated's native runtime, and a pan gesture can't be driven from Jest anyway. The
// gesture rules themselves are unit-tested in swipe-row-config.test.ts. This renders both panels
// plus test buttons `<testID>-swipe-right` / `<testID>-swipe-left` that do what releasing a
// committed swipe does: call `onSwipe` with the side the finger moved.
import { Pressable, View } from 'react-native';

import type { SwipeRowProps } from '../SwipeRow';

export function SwipeRow({ testID, children, leftPanel, rightPanel, onSwipe }: SwipeRowProps) {
  return (
    <View testID={testID}>
      {leftPanel !== undefined ? (
        <>
          {leftPanel}
          <Pressable testID={`${testID}-swipe-right`} onPress={() => onSwipe('right')} />
        </>
      ) : null}
      {rightPanel !== undefined ? (
        <>
          {rightPanel}
          <Pressable testID={`${testID}-swipe-left`} onPress={() => onSwipe('left')} />
        </>
      ) : null}
      {children}
    </View>
  );
}
