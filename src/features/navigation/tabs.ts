import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

/** Ionicons glyph name, checked against the installed glyph map at compile time. */
export type TabIconName = ComponentProps<typeof Ionicons>['name'];

export type AppTabName = 'index' | 'inbox' | 'buddy' | 'settings';

export type AppTab = {
  /** Route file name inside `src/app/(tabs)/` (`index` serves `/`). */
  name: AppTabName;
  title: string;
  /** Pathname the tab serves, for tests and links. */
  href: '/' | '/inbox' | '/buddy' | '/settings';
  icon: { default: TabIconName; focused: TabIconName };
};

/**
 * The app's bottom tabs, in display order (TB-18). Single source of truth for the tab layout and
 * its tests. Tabs are static: adding or removing one is a product decision, not runtime state.
 */
export const APP_TABS: readonly AppTab[] = [
  {
    name: 'index',
    title: 'Today',
    href: '/',
    icon: { default: 'today-outline', focused: 'today' },
  },
  {
    name: 'inbox',
    title: 'Inbox',
    href: '/inbox',
    icon: { default: 'file-tray-outline', focused: 'file-tray' },
  },
  {
    name: 'buddy',
    title: 'Buddy',
    href: '/buddy',
    icon: { default: 'chatbubble-ellipses-outline', focused: 'chatbubble-ellipses' },
  },
  {
    name: 'settings',
    title: 'Settings',
    href: '/settings',
    icon: { default: 'settings-outline', focused: 'settings' },
  },
];

/** `testID` of a tab bar button, for tests and E2E flows. */
export function tabButtonTestId(name: AppTabName): string {
  return `tab-${name}`;
}
