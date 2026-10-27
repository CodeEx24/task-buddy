/**
 * Test helper: a controllable stand-in for React Native's `Appearance` module, so tests can flip
 * the system colour scheme while components stay mounted (TB-17 AC1).
 *
 * Usage (jest.mock is hoisted, so require the helper inside the factory). The React Native
 * Jest preset stubs `useColorScheme` to 'light', so restore the real hook as well:
 *   jest.mock('react-native/Libraries/Utilities/useColorScheme', () =>
 *     jest.requireActual('react-native/Libraries/Utilities/useColorScheme'),
 *   );
 *   jest.mock('react-native/Libraries/Utilities/Appearance', () =>
 *     jest.requireActual('@/theme/testing/mock-appearance').appearanceModule,
 *   );
 *   import { setSystemColorScheme } from '@/theme/testing/mock-appearance';
 */
type Scheme = 'light' | 'dark';
type Listener = (preferences: { colorScheme: Scheme }) => void;

let current: Scheme = 'light';
const listeners = new Set<Listener>();

export const appearanceModule = {
  getColorScheme: (): Scheme => current,
  setColorScheme: (scheme: Scheme | null | undefined): void =>
    setSystemColorScheme(scheme ?? 'light'),
  addChangeListener: (listener: Listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  },
};

/** Simulates the OS switching appearance: updates the value and notifies subscribers. */
export function setSystemColorScheme(scheme: Scheme): void {
  current = scheme;
  listeners.forEach((listener) => listener({ colorScheme: scheme }));
}
