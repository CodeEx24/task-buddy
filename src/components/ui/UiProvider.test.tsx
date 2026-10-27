import { act, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { themeVars } from '@/theme';
import { setSystemColorScheme } from '@/theme/testing/mock-appearance';

import { UiProvider } from './UiProvider';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () =>
  jest.requireActual('react-native/Libraries/Utilities/useColorScheme'),
);
jest.mock(
  'react-native/Libraries/Utilities/Appearance',
  () => jest.requireActual('@/theme/testing/mock-appearance').appearanceModule,
);

describe('UiProvider', () => {
  afterEach(() => act(() => setSystemColorScheme('light')));

  it('renders its children', async () => {
    await render(
      <UiProvider>
        <Text>child</Text>
      </UiProvider>,
    );
    expect(screen.getByText('child')).toBeOnTheScreen();
  });

  it('swaps the theme variables when the system theme flips, without remounting children', async () => {
    const onMount = jest.fn();
    function Child() {
      useEffect(() => onMount(), []);
      return <Text>child</Text>;
    }
    await render(
      <UiProvider>
        <Child />
      </UiProvider>,
    );
    const root = () => screen.getByTestId('ui-provider-root');
    expect(root().props.style).toContain(themeVars.light);

    await act(() => setSystemColorScheme('dark'));

    expect(root().props.style).toContain(themeVars.dark);
    expect(root().props.style).not.toContain(themeVars.light);
    expect(onMount).toHaveBeenCalledTimes(1);
  });
});
