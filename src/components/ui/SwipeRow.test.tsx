// The real SwipeRow (jest-setup installs a stand-in for screens). Gesture-handler and Reanimated
// are replaced so the test can read the pan config and drive its callbacks like the UI thread.
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { usePanGesture } from 'react-native-gesture-handler';

import { SwipeRow } from './SwipeRow';
import { SWIPE_PAN_OFFSETS } from './swipe-row-config';

jest.unmock('./SwipeRow');
jest.mock('react-native-gesture-handler', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    usePanGesture: jest.fn((config: unknown) => config),
    GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View },
    ReduceMotion: { System: 'system' },
    useSharedValue: (initial: number) => {
      let value = initial;
      return { get: () => value, set: (next: number) => (value = next) };
    },
    useAnimatedStyle: (fn: () => object) => fn(),
    withSpring: (to: number) => to,
  };
});
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));

type PanConfig = typeof SWIPE_PAN_OFFSETS & {
  onUpdate: (e: { translationX: number }) => void;
  onDeactivate: (e: {
    canceled: boolean;
    translationX: number;
    translationY: number;
    velocityX: number;
  }) => void;
};
const lastPanConfig = () => jest.mocked(usePanGesture).mock.calls.at(-1)?.[0] as PanConfig;

async function renderRow(onSwipe = jest.fn(), withRight = true) {
  await render(
    <SwipeRow
      testID="row"
      onSwipe={onSwipe}
      leftPanel={<Text>Left</Text>}
      rightPanel={withRight ? <Text>Right</Text> : undefined}
    >
      <Text>Content</Text>
    </SwipeRow>,
  );
  return onSwipe;
}

describe('SwipeRow (TB-27)', () => {
  it('passes the vertical-fail / horizontal-activate offsets to the pan gesture', async () => {
    await renderRow();
    expect(lastPanConfig()).toMatchObject({ activeOffsetX: [-20, 20], failOffsetY: [-12, 12] });
    expect(screen.getByText('Content')).toBeOnTheScreen();
  });

  it('calls onSwipe once for a committed release, never for a vertical-dominant one', async () => {
    const onSwipe = await renderRow();
    const pan = lastPanConfig();

    pan.onDeactivate({ canceled: false, translationX: 95, translationY: 152, velocityX: 0 });
    pan.onDeactivate({ canceled: false, translationX: 40, translationY: 0, velocityX: 0 });
    pan.onDeactivate({ canceled: true, translationX: 200, translationY: 0, velocityX: 0 });
    expect(onSwipe).not.toHaveBeenCalled();

    pan.onDeactivate({ canceled: false, translationX: 100, translationY: 5, velocityX: 0 });
    pan.onDeactivate({ canceled: false, translationX: -100, translationY: 5, velocityX: 0 });
    expect(onSwipe.mock.calls).toEqual([['right'], ['left']]);
  });

  it('a missing panel disables that direction', async () => {
    const onSwipe = await renderRow(jest.fn(), false);
    lastPanConfig().onDeactivate({
      canceled: false,
      translationX: -150,
      translationY: 0,
      velocityX: 0,
    });
    expect(onSwipe).not.toHaveBeenCalled();
    expect(screen.queryByText('Right')).toBeNull();
  });
});
