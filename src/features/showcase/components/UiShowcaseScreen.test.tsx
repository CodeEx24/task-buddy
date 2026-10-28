import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { UiProvider } from '@/components/ui';
import { colors, themeVars } from '@/theme';
import { setSystemColorScheme } from '@/theme/testing/mock-appearance';

import { UiShowcaseScreen } from './UiShowcaseScreen';

// Restore the real useColorScheme (the RN Jest preset stubs it) on top of a controllable
// Appearance module, so the test can flip the system theme like the OS does on a device.
jest.mock('react-native/Libraries/Utilities/useColorScheme', () =>
  jest.requireActual('react-native/Libraries/Utilities/useColorScheme'),
);
jest.mock(
  'react-native/Libraries/Utilities/Appearance',
  () => jest.requireActual('@/theme/testing/mock-appearance').appearanceModule,
);

async function renderShowcase() {
  return render(
    <UiProvider>
      <UiShowcaseScreen />
    </UiProvider>,
  );
}

describe('UiShowcaseScreen', () => {
  afterEach(() => act(() => setSystemColorScheme('light')));

  it('renders the showcase with the app name', async () => {
    await renderShowcase();

    expect(screen.getByTestId('ui-showcase-screen')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Task Buddy' })).toBeOnTheScreen();
  });

  it('uses every primitive: Card, Input, Checkbox, Buttons and Sheet', async () => {
    await renderShowcase();

    expect(screen.getByRole('header', { name: 'Try the buddy' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Task name')).toBeOnTheScreen();
    const checkbox = screen.getByRole('checkbox', { name: 'Mark as done' });
    expect(checkbox).not.toBeChecked();

    await fireEvent.press(checkbox);
    expect(screen.getByRole('checkbox', { name: 'Mark as done' })).toBeChecked();

    await fireEvent.press(screen.getByRole('button', { name: 'Open sheet' }));
    expect(screen.getByRole('header', { name: 'Your buddy' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('header', { name: 'Your buddy' })).toBeNull();
  });

  it('clears the form with the ghost button', async () => {
    await renderShowcase();

    await fireEvent.changeText(screen.getByLabelText('Task name'), 'Buy milk');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Mark as done' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('Task name').props.value).toBe('');
    expect(screen.getByRole('checkbox', { name: 'Mark as done' })).not.toBeChecked();
  });

  // AC1: the system theme changes while the app is open → every primitive re-themes without a
  // reload. Token classes resolve through the theme variables; hex-only props come from useTheme.
  it('switches theme live without remounting, even with the Sheet open', async () => {
    await renderShowcase();
    await fireEvent.changeText(screen.getByLabelText('Task name'), 'Buy milk');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Mark as done' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Open sheet' }));

    expect(screen.getByTestId('ui-provider-root').props.style).toContain(themeVars.light);
    expect(screen.getByTestId('home-sheet').props.style).toBe(themeVars.light);
    expect(screen.getByTestId('bottom-sheet-background')).toHaveStyle({
      backgroundColor: colors.light.surface,
    });
    expect(screen.getByLabelText('Task name').props.placeholderTextColor).toBe(
      colors.light.textMuted,
    );

    await act(() => setSystemColorScheme('dark'));

    // The variables behind every token class (Button, Input, Card, Checkbox, Sheet) swapped,
    // at the root and inside the Sheet's portal.
    expect(screen.getByTestId('ui-provider-root').props.style).toContain(themeVars.dark);
    expect(screen.getByTestId('home-sheet').props.style).toBe(themeVars.dark);
    // Hex-driven props re-themed.
    expect(screen.getByTestId('bottom-sheet-background')).toHaveStyle({
      backgroundColor: colors.dark.surface,
    });
    expect(screen.getByLabelText('Task name').props.placeholderTextColor).toBe(
      colors.dark.textMuted,
    );
    // No reload: state survived and the Sheet is still open.
    expect(screen.getByLabelText('Task name').props.value).toBe('Buy milk');
    expect(screen.getByRole('checkbox', { name: 'Mark as done' })).toBeChecked();
    expect(screen.getByRole('header', { name: 'Your buddy' })).toBeOnTheScreen();
  });
});
