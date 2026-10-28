import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  resolveSwipe,
  SWIPE_PAN_OFFSETS,
  SWIPE_PANEL_WIDTH,
  swipeRowOffset,
  type SwipeSide,
} from './swipe-row-config';

export type SwipeRowProps = {
  testID?: string;
  children: ReactNode;
  /** Uncovered when the finger moves right. Omit to disable that direction. */
  leftPanel?: ReactNode;
  /** Uncovered when the finger moves left. Omit to disable that direction. */
  rightPanel?: ReactNode;
  /** Called once when a swipe is released past the commit distance (side the finger moved). */
  onSwipe: (side: SwipeSide) => void;
};

/** Snap back after a release (finger involved → spring; no overshoot past the edge). */
const SNAP_BACK = {
  duration: 400,
  dampingRatio: 1,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
};

/**
 * A list row that commits an action on a horizontal swipe (TB-27). The pan only activates after
 * 20 pt of horizontal travel and fails as soon as the finger moves 12 pt vertically first, so
 * scrolling the list never opens a row (`swipe-row-config.ts`). Everything after activation runs
 * on the UI thread; `onSwipe` is scheduled back to React once, on release.
 *
 * Cheap at rest (TB-27 AC3, 500-row lists): one shared value, one animated style and the pan per
 * row. The panels mount only when a finger first touches the row (`onBegin`, before the 20 pt
 * activation), and stay mounted after that; they sit under the row, so no per-panel animation.
 *
 * Panels are decorative: give screen-reader users the same actions another way (for example
 * accessibility actions on the row's main control) and hide the panels from assistive tech.
 */
export function SwipeRow({ testID, children, leftPanel, rightPanel, onSwipe }: SwipeRowProps) {
  const hasLeftPanel = leftPanel !== undefined;
  const hasRightPanel = rightPanel !== undefined;
  const offset = useSharedValue(0);
  const [hasPanels, setHasPanels] = useState(false);
  const mountPanels = useCallback(() => setHasPanels(true), []);

  const panConfig = useMemo(
    () => ({
      ...SWIPE_PAN_OFFSETS,
      onBegin: () => {
        'worklet';
        // Once per touch, never per frame; a repeated `true` is a no-op render bail-out.
        scheduleOnRN(mountPanels);
      },
      onUpdate: (event: { translationX: number }) => {
        'worklet';
        offset.set(swipeRowOffset(event.translationX, hasLeftPanel, hasRightPanel));
      },
      onDeactivate: (event: {
        canceled: boolean;
        translationX: number;
        translationY: number;
        velocityX: number;
      }) => {
        'worklet';
        const side = event.canceled ? null : resolveSwipe(event, hasLeftPanel, hasRightPanel);
        offset.set(withSpring(0, { ...SNAP_BACK, velocity: event.velocityX }));
        if (side) scheduleOnRN(onSwipe, side);
      },
      onFinalize: () => {
        'worklet';
        // Cancelled before activation (or by the system): make sure the row is home.
        if (offset.get() !== 0) offset.set(withSpring(0, SNAP_BACK));
      },
    }),
    [hasLeftPanel, hasRightPanel, mountPanels, offset, onSwipe],
  );
  const pan = usePanGesture(panConfig);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));

  return (
    <View testID={testID} style={styles.container}>
      {hasPanels && hasLeftPanel ? (
        <View pointerEvents="none" style={styles.leftPanel}>
          {leftPanel}
        </View>
      ) : null}
      {hasPanels && hasRightPanel ? (
        <View pointerEvents="none" style={styles.rightPanel}>
          {rightPanel}
        </View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  leftPanel: { position: 'absolute', top: 0, bottom: 0, left: 0, width: SWIPE_PANEL_WIDTH },
  rightPanel: { position: 'absolute', top: 0, bottom: 0, right: 0, width: SWIPE_PANEL_WIDTH },
});
