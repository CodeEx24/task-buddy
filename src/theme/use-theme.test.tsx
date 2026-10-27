import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { setSystemColorScheme } from './testing/mock-appearance';
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
  afterEach(() => act(() => setSystemColorScheme('light')));

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
});
