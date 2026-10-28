import { useEffect, type ReactNode } from 'react';

import { tabSwitchTimer } from '../tab-switch-timing';

/** The slice of a navigation object `TabScene` needs (structural, so no navigator types leak). */
export type FocusEventSource = {
  addListener: (type: 'focus', callback: () => void) => () => void;
};

export type TabSceneProps = {
  name: string;
  navigation: FocusEventSource;
  children: ReactNode;
};

/**
 * Wraps every tab screen (via the tab navigator's `screenLayout`). On focus, it waits one
 * animation frame (the first frame showing the tab) and reports it to the dev-only tab-switch
 * timer. Renders its children unchanged.
 */
export function TabScene({ name, navigation, children }: TabSceneProps) {
  useEffect(() => {
    let frame: number | undefined;
    const unsubscribe = navigation.addListener('focus', () => {
      frame = requestAnimationFrame(() => {
        tabSwitchTimer.reportFocus(name);
      });
    });
    return () => {
      unsubscribe();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [name, navigation]);

  return <>{children}</>;
}
