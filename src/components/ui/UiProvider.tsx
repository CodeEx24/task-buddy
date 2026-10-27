import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { themeVars, useTheme } from '@/theme';

import { SheetHost } from './SheetHost';

export type UiProviderProps = {
  children: ReactNode;
};

/**
 * Root provider for the design system (TB-17). Mount once around the app.
 * - Defines the colour CSS variables for the current system scheme. Every token class
 *   (`bg-surface`, `text-text`) resolves through them, so a system theme change re-styles all
 *   primitives live, without a reload.
 * - Provides the gesture root and the `SheetHost` that `Sheet` renders into. The variables wrap
 *   the sheet host, so sheet content follows the theme too.
 */
export function UiProvider({ children }: UiProviderProps) {
  const { scheme } = useTheme();
  return (
    <GestureHandlerRootView style={styles.fill}>
      <View
        testID="ui-provider-root"
        style={[styles.fill, themeVars[scheme]]}
        className="bg-background"
      >
        <SheetHost>{children}</SheetHost>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
