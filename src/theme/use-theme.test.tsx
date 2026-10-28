import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { setColorSchemePreference } from './color-scheme-preference';
import { appearanceModule, setSystemColorScheme } from './testing/mock-appearance';
import { colors } from './tokens';
import { resolveScheme, useTheme } from './use-theme';

// The React Native Jest preset stubs useColorScheme to 'light'; restore the real hook so it
// subscribes to the controllable Appearance mock, like the OS appearance event on a device.
jest.mock('react-native/Libraries/Utilities/useColorScheme', () =>
  jest.requireActual('react-native/Libraries/Utilities/useColorScheme'),
);
jest.mock(
  'react-native/Libraries/Utilities/Appearance',
  () => jest.requireActual('./testing/mock-appearance').appearanceModule,
);

function Probe() {
  const theme = useTheme();
  return <Text testID="probe">{`${theme.scheme}:${theme.colors.background}`}</Text>;
}

describe('useTheme', () => {
  afterEach(() =>
    act(() => {
      setColorSchemePreference('system');
      setSystemColorScheme('light');
    }),
  );

  it('falls back to light for unknown schemes', () => {
    expect(resolveScheme(null)).toBe('light');
    expect(resolveScheme('unspecified')).toBe('light');
    expect(resolveScheme('dark')).toBe('dark');
  });

  it('follows the system appearance live', async () => {
    await render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent(`light:${colors.light.background}`);

    await act(() => setSystemColorScheme('dark'));

    expect(screen.getByTestId('probe')).toHaveTextContent(`dark:${colors.dark.background}`);
  });

  it('applies the in-app choice to mounted screens at once, with no Appearance event (TB-32)', async () => {
    // Regression: RN 0.88's Appearance.setColorScheme emitted no change event on Android, so
    // mounted screens kept the old colours. The in-app choice must not depend on that event.
    const listeners = jest.spyOn(appearanceModule, 'addChangeListener');
    await render(<Probe />);
    const setNative = jest.spyOn(appearanceModule, 'setColorScheme');

    await act(() => setColorSchemePreference('dark'));
    expect(screen.getByTestId('probe')).toHaveTextContent(`dark:${colors.dark.background}`);

    await act(() => setColorSchemePreference('light'));
    expect(screen.getByTestId('probe')).toHaveTextContent(`light:${colors.light.background}`);
    // No native night-mode override (it re-measured text under a new configuration on device).
    expect(setNative).not.toHaveBeenCalled();
    expect(listeners).toHaveBeenCalled();
  });

  it('an in-app choice wins over the device until it is set back to system (TB-32)', async () => {
    await render(<Probe />);
    await act(() => setColorSchemePreference('light'));

    await act(() => setSystemColorScheme('dark'));
    expect(screen.getByTestId('probe')).toHaveTextContent(`light:${colors.light.background}`);

    await act(() => setColorSchemePreference('system'));
    expect(screen.getByTestId('probe')).toHaveTextContent(`dark:${colors.dark.background}`);
  });
});
