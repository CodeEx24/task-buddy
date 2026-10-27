import type { ReactNode } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';

import { MIN_TOUCH_TARGET } from '@/theme';

export type CardProps = {
  title?: string;
  children?: ReactNode;
  /** Makes the whole card a pressable button. */
  onPress?: (event: GestureResponderEvent) => void;
  /** Defaults to `title` when the card is pressable. */
  accessibilityLabel?: string;
  className?: string;
  testID?: string;
};

const CONTAINER = 'gap-md rounded-lg border border-border bg-surface p-lg';

function CardTitle({ title }: { title: string }) {
  return (
    <Text accessibilityRole="header" className="text-lg font-semibold text-text">
      {title}
    </Text>
  );
}

/** Surface container. Pressable (button role, pressed state, 44pt target) when `onPress` is set. */
export function Card({
  title,
  children,
  onPress,
  accessibilityLabel,
  className = '',
  testID,
}: CardProps) {
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        style={{ minHeight: MIN_TOUCH_TARGET }}
        className={`${CONTAINER} active:opacity-80 ${className}`}
      >
        {title ? <CardTitle title={title} /> : null}
        {children}
      </Pressable>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      className={`${CONTAINER} ${className}`}
    >
      {title ? <CardTitle title={title} /> : null}
      {children}
    </View>
  );
}
